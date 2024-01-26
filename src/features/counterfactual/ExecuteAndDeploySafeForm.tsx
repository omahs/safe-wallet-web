import { TxModalContext } from '@/components/tx-flow'
import { removeUndeployedSafe } from '@/features/counterfactual/store/undeployedSafeSlice'
import useAsync from '@/hooks/useAsync'
import useChainId from '@/hooks/useChainId'
import useSafeInfo from '@/hooks/useSafeInfo'
import useWalletCanPay from '@/hooks/useWalletCanPay'
import useOnboard from '@/hooks/wallets/useOnboard'
import { getSafeSDKWithSigner } from '@/services/tx/tx-sender/sdk'
import { useAppDispatch } from '@/store'
import madProps from '@/utils/mad-props'
import { estimateSafeDeploymentGas, estimateSafeTxGas, estimateTxBaseGas } from '@safe-global/protocol-kit'
import React, { type ReactElement, type SyntheticEvent, useContext, useState } from 'react'
import { CircularProgress, Box, Button, CardActions, Divider } from '@mui/material'
import classNames from 'classnames'

import ErrorMessage from '@/components/tx/ErrorMessage'
import { trackError, Errors } from '@/services/exceptions'
import { useCurrentChain } from '@/hooks/useChains'
import { getTxOptions } from '@/utils/transactions'
import CheckWallet from '@/components/common/CheckWallet'
import { useIsExecutionLoop, useTxActions } from 'src/components/tx/SignOrExecuteForm/hooks'
import type { SignOrExecuteProps } from 'src/components/tx/SignOrExecuteForm'
import type { SafeTransaction } from '@safe-global/safe-core-sdk-types'
import AdvancedParams, { useAdvancedParams } from 'src/components/tx/AdvancedParams'
import { asError } from '@/services/exceptions/utils'

import css from 'src/components/tx/SignOrExecuteForm/styles.module.css'
import commonCss from '@/components/tx-flow/common/styles.module.css'
import { TxSecurityContext } from 'src/components/tx/security/shared/TxSecurityContext'
import useIsSafeOwner from '@/hooks/useIsSafeOwner'
import NonOwnerError from '@/components/tx/SignOrExecuteForm/NonOwnerError'

const useDeployGasLimit = (safeTx?: SafeTransaction) => {
  const onboard = useOnboard()
  const chainId = useChainId()

  const [gasLimit, gasLimitError, gasLimitLoading] = useAsync<bigint | undefined>(async () => {
    if (!safeTx || !onboard) return

    const sdk = await getSafeSDKWithSigner(onboard, chainId)

    const gas = await estimateTxBaseGas(sdk, safeTx)
    const safeTxGas = await estimateSafeTxGas(sdk, safeTx)
    const safeDeploymentGas = await estimateSafeDeploymentGas(sdk)

    return BigInt(gas) + BigInt(safeTxGas) + BigInt(safeDeploymentGas)
  }, [onboard, chainId, safeTx])

  return { gasLimit, gasLimitError, gasLimitLoading }
}

export const ExecuteAndDeploySafeForm = ({
  safeTx,
  disableSubmit = false,
  onlyExecute,
  isCreation,
  isOwner,
  isExecutionLoop,
  txActions,
  txSecurity,
}: SignOrExecuteProps & {
  isOwner: ReturnType<typeof useIsSafeOwner>
  isExecutionLoop: ReturnType<typeof useIsExecutionLoop>
  txActions: ReturnType<typeof useTxActions>
  txSecurity: ReturnType<typeof useTxSecurityContext>
  safeTx?: SafeTransaction
}): ReactElement => {
  const onboard = useOnboard()
  const chainId = useChainId()
  const dispatch = useAppDispatch()
  const { safeAddress } = useSafeInfo()

  // Form state
  const [isSubmittable, setIsSubmittable] = useState<boolean>(true)
  const [submitError, setSubmitError] = useState<Error | undefined>()

  // Hooks
  const currentChain = useCurrentChain()
  const { deploySafeAndExecuteTx } = txActions
  const { needsRiskConfirmation, isRiskConfirmed, setIsRiskIgnored } = txSecurity
  const { setTxFlow } = useContext(TxModalContext)

  // Estimate gas limit
  const { gasLimit, gasLimitError } = useDeployGasLimit(safeTx)
  const [advancedParams, setAdvancedParams] = useAdvancedParams(gasLimit)

  // Check if transaction will fail
  // TODO: Check if we can do this with multisend
  //const { executionValidationError } = useIsValidExecution(safeTx, advancedParams.gasLimit)

  // On modal submit
  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault()

    if (needsRiskConfirmation && !isRiskConfirmed) {
      setIsRiskIgnored(true)
      return
    }

    setIsSubmittable(false)
    setSubmitError(undefined)

    const txOptions = getTxOptions(advancedParams, currentChain)

    try {
      await deploySafeAndExecuteTx(txOptions, safeTx)
      dispatch(removeUndeployedSafe({ chainId, address: safeAddress }))
    } catch (_err) {
      const err = asError(_err)
      trackError(Errors._804, err)
      setIsSubmittable(true)
      setSubmitError(err)
      return
    }

    // TODO: Show a success or status screen
    setTxFlow(undefined)
  }

  const walletCanPay = useWalletCanPay({
    gasLimit,
    maxFeePerGas: advancedParams.maxFeePerGas,
    maxPriorityFeePerGas: advancedParams.maxPriorityFeePerGas,
  })

  const cannotPropose = !isOwner && !onlyExecute
  const submitDisabled =
    !safeTx ||
    !isSubmittable ||
    disableSubmit ||
    isExecutionLoop ||
    cannotPropose ||
    (needsRiskConfirmation && !isRiskConfirmed)

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className={classNames(css.params)}>
          <AdvancedParams
            willExecute
            params={advancedParams}
            recommendedGasLimit={gasLimit}
            onFormSubmit={setAdvancedParams}
            gasLimitError={gasLimitError}
            willRelay={false}
          />
        </div>

        {/* Error messages */}
        {cannotPropose ? (
          <NonOwnerError />
        ) : isExecutionLoop ? (
          <ErrorMessage>
            Cannot execute a transaction from the Safe Account itself, please connect a different account.
          </ErrorMessage>
        ) : !walletCanPay ? (
          <ErrorMessage>Your connected wallet doesn&apos;t have enough funds to execute this transaction.</ErrorMessage>
        ) : (
          gasLimitError && (
            <ErrorMessage error={gasLimitError}>
              This transaction will most likely fail.
              {` To save gas costs, ${isCreation ? 'avoid creating' : 'reject'} this transaction.`}
            </ErrorMessage>
          )
        )}

        {submitError && (
          <Box mt={1}>
            <ErrorMessage error={submitError}>Error submitting the transaction. Please try again.</ErrorMessage>
          </Box>
        )}

        <Divider className={commonCss.nestedDivider} sx={{ pt: 3 }} />

        <CardActions>
          {/* Submit button */}
          <CheckWallet allowNonOwner={onlyExecute}>
            {(isOk) => (
              <Button variant="contained" type="submit" disabled={!isOk || submitDisabled} sx={{ minWidth: '112px' }}>
                {!isSubmittable ? <CircularProgress size={20} /> : 'Execute'}
              </Button>
            )}
          </CheckWallet>
        </CardActions>
      </form>
    </>
  )
}

const useTxSecurityContext = () => useContext(TxSecurityContext)

export default madProps(ExecuteAndDeploySafeForm, {
  isOwner: useIsSafeOwner,
  isExecutionLoop: useIsExecutionLoop,
  txActions: useTxActions,
  txSecurity: useTxSecurityContext,
})