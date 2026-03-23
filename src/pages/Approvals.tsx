import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, ShieldAlert } from "lucide-react"
import type { ApprovalRequest } from "@/types"

export default function Approvals() {
  const queryClient = useQueryClient()

  const { data: approvals, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      const res = await fetch('/api/approvals')
      return res.json() as Promise<ApprovalRequest[]>
    }
  })

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'denied' }) => {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update approval')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading approvals...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Approval Gates</h2>
        <p className="text-muted-foreground">Review and authorize blocked agent actions.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Proposed Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {approvals?.map((approval) => (
              <TableRow key={approval.id}>
                <TableCell className="font-mono text-xs">{approval.runId.substring(0, 8)}</TableCell>
                <TableCell>
                  <div className="flex items-start space-x-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{approval.reason}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <pre className="bg-slate-100 p-2 rounded text-[10px] overflow-x-auto max-w-[300px]">
                    {(() => {
                      try { return JSON.stringify(JSON.parse(approval.proposedAction), null, 2); }
                      catch { return approval.proposedAction; }
                    })()}
                  </pre>
                </TableCell>
                <TableCell>
                  <Badge variant={approval.status === 'pending' ? 'default' : approval.status === 'approved' ? 'default' : 'destructive'}>
                    {approval.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {approval.status === 'pending' ? (
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => approveMutation.mutate({ id: approval.id, status: 'denied' })}
                        disabled={approveMutation.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Deny
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => approveMutation.mutate({ id: approval.id, status: 'approved' })}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="secondary">{approval.status}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!approvals || approvals.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No pending approvals.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
