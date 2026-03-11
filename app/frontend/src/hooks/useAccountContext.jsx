import { createContext, useContext, useState } from 'react'

const AccountContext = createContext({ selectedAccount: '', setAccount: () => {} })

export function AccountProvider({ children }) {
  const [selectedAccount, setSelectedAccount] = useState(
    () => localStorage.getItem('cloudops_account') || ''
  )

  const setAccount = (id) => {
    setSelectedAccount(id)
    if (id) localStorage.setItem('cloudops_account', id)
    else localStorage.removeItem('cloudops_account')
  }

  return (
    <AccountContext.Provider value={{ selectedAccount, setAccount }}>
      {children}
    </AccountContext.Provider>
  )
}

export function useAccountContext() {
  return useContext(AccountContext)
}
