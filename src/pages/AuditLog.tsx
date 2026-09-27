import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { AuditEvent } from "@/types"
import { api } from "@/lib/api"

const eventTypeColors: Record<string, string> = {
  agent_created: 'bg-emerald-100 text-emerald-800',
  agent_updated: 'bg-blue-100 text-blue-800',
  agent_deleted: 'bg-red-100 text-red-800',
  policy_created: 'bg-emerald-100 text-emerald-800',
  policy_updated: 'bg-blue-100 text-blue-800',
  policy_deleted: 'bg-red-100 text-red-800',
  run_started: 'bg-blue-100 text-blue-800',
  run_completed: 'bg-emerald-100 text-emerald-800',
  run_failed: 'bg-red-100 text-red-800',
  run_blocked: 'bg-red-100 text-red-800',
  step_blocked: 'bg-red-100 text-red-800',
  approval_granted: 'bg-emerald-100 text-emerald-800',
  approval_denied: 'bg-red-100 text-red-800',
  incident_created: 'bg-amber-100 text-amber-800',
  browser_session_created: 'bg-blue-100 text-blue-800',
  browser_action_blocked: 'bg-red-100 text-red-800',
  user_login: 'bg-slate-100 text-slate-800',
  user_registered: 'bg-emerald-100 text-emerald-800',
};

export default function AuditLog() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-events'],
    queryFn: async () => {
      return api('/audit-events?limit=100')
    }
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading audit log...</div>

  const events: AuditEvent[] = data?.events || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
        <p className="text-muted-foreground">Complete audit trail of all platform activities.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                  {new Date(event.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${eventTypeColors[event.eventType] || 'bg-slate-100 text-slate-800'}`}>
                    {event.eventType.replace(/_/g, ' ')}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <span className="text-slate-500">{event.resourceType}/</span>
                    <span className="font-mono text-xs">{event.resourceId.substring(0, 8)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{event.actor?.name || event.actor?.email || event.actorId.substring(0, 8)}</span>
                </TableCell>
                <TableCell>
                  <pre className="text-[10px] text-slate-500 max-w-[300px] truncate">
                    {(() => {
                      try { const d = JSON.parse(event.details); return Object.keys(d).length > 0 ? JSON.stringify(d) : '-'; }
                      catch { return event.details || '-'; }
                    })()}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No audit events recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
