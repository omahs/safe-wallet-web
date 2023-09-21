import { useMPCWallet, MPCWalletState } from '@/hooks/wallets/mpc/useMPCWallet'
import { createContext, type ReactElement } from 'react'

type MPCWalletContext = {
  loginPending: boolean
  triggerLogin: () => Promise<void>
  resetAccount: () => Promise<void>
  upsertPasswordBackup: (password: string) => Promise<void>
  recoverFactorWithPassword: (password: string) => Promise<void>
  walletState: MPCWalletState
  userInfo: {
    email: string | undefined
  }
}

export const MpcWalletContext = createContext<MPCWalletContext>({
  loginPending: false,
  walletState: MPCWalletState.NOT_INITIALIZED,
  triggerLogin: () => Promise.resolve(),
  resetAccount: () => Promise.resolve(),
  upsertPasswordBackup: () => Promise.resolve(),
  recoverFactorWithPassword: () => Promise.resolve(),
  userInfo: {
    email: undefined,
  },
})

export const MpcWalletProvider = ({ children }: { children: ReactElement }) => {
  const mpcValue = useMPCWallet()

  return (
    <MpcWalletContext.Provider
      value={{ ...mpcValue, loginPending: mpcValue.walletState === MPCWalletState.AUTHENTICATING }}
    >
      {children}
    </MpcWalletContext.Provider>
  )
}
