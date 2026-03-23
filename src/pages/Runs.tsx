import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { Activity, Play } from "lucide-react"
import RiskScoreBar from "@/components/RiskScoreBar"
import StatusBadge from "@/components/StatusBadge"
import RunDialog from "@/components/dialogs/RunDialog"
import type { Run } from "@/types"

export default function Runs() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: async () => {
      const res = await fetch('/api/runs')
      return res.json() as Promise<Run[]>
    }
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading runs...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Execution Runs</h2>
          <p className="text-muted-foreground">Monitor and inspect agent execution pipelines.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Play className="mr-2 h-4 w-4" /> Start New Run
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk Score</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs?.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium line-clamp-1 max-w-[300px]">{run.task}</div>
                      <div className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{run.agent?.name}</Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={run.status} />
                </TableCell>
                <TableCell>
                  <RiskScoreBar score={run.riskScore} />
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">{run.confidence || 0}%</span>
                </TableCell>
                <TableCell className="text-right">
                  <Link to={`/runs/${run.id}`}>
                    <Button variant="ghost" size="sm">Inspect</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {(!runs || runs.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  No runs executed yet. Click "Start New Run" to begin.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <RunDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
