import React from 'react'

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="auth" suppressHydrationWarning>{children}</main>
  )
}

export default Layout