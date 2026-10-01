import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Key, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import type { Agent, ApiKey } from "@/types"

export default function ApiKeysCard() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [agentId, setAgentId] = useState("")
  const [expiresInDays, setExpiresInDays] = useState("")
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: keys } = useQuery({ queryKey: ["api-keys"], queryFn: () => api<ApiKey[]>("/api-keys") })
  const { data: agents } = useQuery({ queryKey: ["agents"], queryFn: () => api<Agent[]>("/agents") })

  const createMutation = useMutation({
    mutationFn: () => api<{ key: string }>("/api-keys", {
      method: "POST",
      body: { name, agentId, expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined },
    }),
    onSuccess: (data) => {
      setNewKey(data.key)
      setCreating(false)
      setName(""); setAgentId(""); setExpiresInDays("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  })

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Key className="w-5 h-5" />
            <span>SDK API Keys</span>
          </CardTitle>
          <Button size="sm" onClick={() => { setCreating(!creating); setNewKey(null) }}>
            <Plus className="w-4 h-4 mr-2" /> Generate Key
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {newKey && (
          <div className="p-3 rounded-md border border-emerald-200 bg-emerald-50 space-y-2">
            <p className="text-sm font-medium text-emerald-900">Copy this key now. It will not be shown again.</p>
            <div className="flex items-center space-x-2">
              <code className="text-xs break-all flex-1">{newKey}</code>
              <Button variant="ghost" size="sm" onClick={() => handleCopy(newKey)} aria-label="Copy key">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        )}

        {creating && (
          <form
            onSubmit={e => { e.preventDefault(); createMutation.mutate() }}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] items-end p-3 border rounded-md"
          >
            <div className="space-y-1">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" value={name} onChange={e => setName(e.target.value)} placeholder="Production agent" required />
            </div>
            <div className="space-y-1">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId} required>
                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {agents?.filter(agent => agent.status === "active").map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-expiry">Expires (days)</Label>
              <Input id="key-expiry" type="number" min="1" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} placeholder="Never" />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !agentId}>Create</Button>
          </form>
        )}

        <div className="space-y-2">
          {keys?.map(key => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
              <div className="min-w-0">
                <p className="text-sm font-medium">{key.name}</p>
                <p className="text-xs text-slate-500">
                  <code>{key.prefix}…</code> · {key.agent?.name ?? "Unknown agent"} · created {new Date(key.createdAt).toLocaleDateString()}
                  {key.expiresAt && <> · expires {new Date(key.expiresAt).toLocaleDateString()}</>}
                  {key.lastUsedAt && <> · last used {new Date(key.lastUsedAt).toLocaleString()}</>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={() => revokeMutation.mutate(key.id)}
                disabled={revokeMutation.isPending}
                aria-label={`Revoke ${key.name}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {keys?.length === 0 && <p className="text-sm text-slate-500">No API keys yet.</p>}
        </div>

        <p className="text-xs text-slate-500">
          Each key acts for one agent: it can start and report runs only for that agent. Send it as
          {" "}<code>Authorization: Bearer sk-…</code> to the <code>/api/v1/sdk</code> endpoints.
        </p>
      </CardContent>
    </Card>
  )
}
