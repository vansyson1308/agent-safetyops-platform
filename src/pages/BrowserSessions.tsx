import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Globe, ShieldAlert, Activity, Plus } from "lucide-react"
import RiskScoreBar from "@/components/RiskScoreBar"
import StatusBadge from "@/components/StatusBadge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Agent, BrowserSession } from "@/types"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function BrowserSessions() {
  const [newUrl, setNewUrl] = useState("")
  const [agentId, setAgentId] = useState("")
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const navigate = useNavigate()

  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['browser-sessions'],
    queryFn: async () => {
      return api<BrowserSession[]>('/browser-sessions')
    }
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<Agent[]>('/agents'),
    enabled: can('operate'),
  })

  const createMutation = useMutation({
    mutationFn: async (url: string) => {
      // The agent's policies apply to the session's actions.
      return api('/browser-sessions', { method: 'POST', body: { url, agentId: agentId || undefined } })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['browser-sessions'] })
      navigate(`/browser-sessions/${data.id}`)
    }
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (newUrl) createMutation.mutate(newUrl)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Browser Sandbox</h2>
          <p className="text-muted-foreground">Monitor and replay agent browser sessions.</p>
        </div>
        {can('operate') && (
          <form onSubmit={handleCreate} className="flex space-x-2">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Agent (optional)" /></SelectTrigger>
              <SelectContent>
                {agents?.filter(agent => agent.status === 'active').map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="url" placeholder="https://example.com" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} required className="w-64" />
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Activity className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              New Session
            </Button>
          </form>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Activity className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading browser sessions...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">
            <ShieldAlert className="w-8 h-8 mx-auto mb-4" />
            <p>Error loading browser sessions. Please try again.</p>
          </div>
        ) : sessions?.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Globe className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">No browser sessions found</h3>
            <p>Create a new session to start monitoring agent browser activity.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target URL</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <div className="font-medium line-clamp-1 max-w-[300px]">{session.url}</div>
                        <div className="text-xs text-slate-500">{new Date(session.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{session.agent?.name || 'Unknown'}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={session.status} />
                  </TableCell>
                  <TableCell>
                    <RiskScoreBar score={session.riskScore} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/browser-sessions/${session.id}`}>
                      <Button variant="ghost" size="sm">Replay</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
