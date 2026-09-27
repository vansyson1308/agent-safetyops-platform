import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Bot, ShieldAlert, ShieldCheck, Shield, Trash2 } from "lucide-react"
import AgentDialog from "@/components/dialogs/AgentDialog"
import type { Agent } from "@/types"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function Agents() {
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      return api<Agent[]>('/agents')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api(`/agents/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const handleCreate = () => { setEditAgent(null); setDialogOpen(true); }
  const handleEdit = (agent: Agent) => { setEditAgent(agent); setDialogOpen(true); }

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading agents...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">AI Agents</h2>
          <p className="text-muted-foreground">Manage and configure your deployed AI agents.</p>
        </div>
        {can('manage') && (
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" /> Register Agent
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Trust Level</TableHead>
              <TableHead>Capabilities</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents?.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-slate-500">{agent.description}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{agent.provider}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    {agent.trustLevel === 'high' && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                    {agent.trustLevel === 'medium' && <Shield className="w-4 h-4 text-amber-500" />}
                    {agent.trustLevel === 'low' && <ShieldAlert className="w-4 h-4 text-red-500" />}
                    <span className="capitalize text-sm">{agent.trustLevel}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {JSON.parse(agent.capabilities).map((cap: string) => (
                      <Badge key={cap} variant="secondary" className="text-[10px]">{cap}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                    {agent.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {can('manage') && (<>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(agent)}>Configure</Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => deleteMutation.mutate(agent.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>)}
                </TableCell>
              </TableRow>
            ))}
            {(!agents || agents.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  No agents registered yet. Click "Register Agent" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AgentDialog open={dialogOpen} onOpenChange={setDialogOpen} agent={editAgent} />
    </div>
  )
}
