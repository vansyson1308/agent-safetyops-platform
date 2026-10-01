import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Navigate, useLocation } from "react-router-dom"
import { Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { User } from "@/types"

interface AuthStatus {
  needsSetup: boolean
  registrationOpen: boolean
}

interface AuthResponse {
  token: string
  user: Pick<User, "id" | "email" | "name" | "role">
}

export default function Login() {
  const { user, signIn } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: status } = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => api<AuthStatus>("/auth/status"),
  })

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? "/"
    return <Navigate to={from} replace />
  }

  const registering = mode === "register" || !!status?.needsSetup

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = registering
        ? await api<AuthResponse>("/auth/register", { method: "POST", body: { name, email, password } })
        : await api<AuthResponse>("/auth/login", { method: "POST", body: { email, password } })
      signIn(res.token, res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-emerald-500" />
            <span className="font-bold text-lg tracking-tight">SafetyOps</span>
          </div>
          <CardTitle className="text-xl">
            {status?.needsSetup ? "Create the owner account" : registering ? "Create an account" : "Sign in"}
          </CardTitle>
          {status?.needsSetup && (
            <p className="text-sm text-slate-500">No accounts exist yet. The first account becomes the instance owner.</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {registering && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={registering ? 8 : undefined}
                autoComplete={registering ? "new-password" : "current-password"}
              />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait..." : registering ? "Create account" : "Sign in"}
            </Button>
          </form>
          {status?.registrationOpen && !status.needsSetup && (
            <button
              type="button"
              className="mt-4 text-sm text-slate-500 hover:text-slate-900 w-full text-center"
              onClick={() => { setMode(registering ? "login" : "register"); setError(null) }}
            >
              {registering ? "Already have an account? Sign in" : "Need an account? Register"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
