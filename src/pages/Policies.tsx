import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, FileText, Trash2 } from "lucide-react"
import PolicyDialog from "@/components/dialogs/PolicyDialog"
import type { Policy } from "@/types"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function Policies() {
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null)

  const { data: policies, isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      return api<Policy[]>('/policies')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api(`/policies/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  })

  const handleCreate = () => { setEditPolicy(null); setDialogOpen(true); }
  const handleEdit = (policy: Policy) => { setEditPolicy(policy); setDialogOpen(true); }

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading policies...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Policies</h2>
          <p className="text-muted-foreground">Define and enforce rules for agent behavior.</p>
        </div>
        {can('manage') && (
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" /> Create Policy
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Constraints</TableHead>
              <TableHead>Severity Threshold</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies?.map((policy) => (
              <TableRow key={policy.id}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium">{policy.name}</div>
                      <div className="text-xs text-slate-500">{policy.description}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{policy.scope}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {policy.maxSpend && <Badge variant="secondary" className="text-[10px]">Max Spend: ${policy.maxSpend}</Badge>}
                    {policy.maxStepsPerRun && <Badge variant="secondary" className="text-[10px]">Max Steps: {policy.maxStepsPerRun}</Badge>}
                    {JSON.parse(policy.blockedTools).length > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{JSON.parse(policy.blockedTools).length} Blocked Tools</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <div className="w-full bg-slate-200 rounded-full h-2.5 max-w-[100px]">
                      <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${policy.severityThreshold}%` }} />
                    </div>
                    <span className="text-xs font-medium">{policy.severityThreshold}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {can('manage') && (<>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(policy)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => deleteMutation.mutate(policy.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>)}
                </TableCell>
              </TableRow>
            ))}
            {(!policies || policies.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No policies defined yet. Click "Create Policy" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <PolicyDialog open={dialogOpen} onOpenChange={setDialogOpen} policy={editPolicy} />
    </div>
  )
}
