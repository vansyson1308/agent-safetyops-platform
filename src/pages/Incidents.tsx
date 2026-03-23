import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, FileText, Download } from "lucide-react"
import type { IncidentReport } from "@/types"

export default function Incidents() {
  const navigate = useNavigate()

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const res = await fetch('/api/incidents')
      return res.json() as Promise<IncidentReport[]>
    }
  })

  const handleExport = () => {
    if (!incidents) return
    const blob = new Blob([JSON.stringify(incidents, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incidents-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading incidents...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Incident Reports</h2>
          <p className="text-muted-foreground">Review and remediate security violations.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!incidents?.length}>
          <Download className="mr-2 h-4 w-4" /> Export Report
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents?.map((incident) => (
              <TableRow key={incident.id}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-slate-900">{incident.title}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{incident.runId.substring(0, 8)}</TableCell>
                <TableCell>
                  <Badge variant={incident.severity === 'high' || incident.severity === 'critical' ? 'destructive' : 'default'}>
                    {incident.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-slate-600 line-clamp-2 max-w-[400px]">{incident.summary}</p>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/runs/${incident.runId}`)}>
                    Investigate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!incidents || incidents.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No incidents reported.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
