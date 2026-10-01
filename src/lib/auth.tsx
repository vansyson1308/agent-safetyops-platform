import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, getToken, setToken, UNAUTHORIZED_EVENT } from "@/lib/api"
import { hasPermission, type Permission } from "@/lib/permissions"
import type { User } from "@/types"

type SessionUser = Pick<User, "id" | "email" | "name" | "role">

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  signIn: (token: string, user: SessionUser) => void
  signOut: () => void
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(() => !!getToken())

  const signOut = useCallback(() => {
    setToken(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const signIn = useCallback((token: string, nextUser: SessionUser) => {
    setToken(token)
    setUser(nextUser)
  }, [])

  // Restore the session from a stored token.
  useEffect(() => {
    if (!getToken()) return
    api<SessionUser>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut)
  }, [signOut])

  const can = useCallback((permission: Permission) => hasPermission(user?.role, permission), [user])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
