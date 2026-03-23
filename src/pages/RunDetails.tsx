import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, RefreshCw, BrainCircuit, Wrench, ShieldAlert } from "lucide-react"
import RiskScoreBar, { getRiskTextColor } from "@/components/RiskScoreBar"

export default function RunDetails() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  const { data: run, isLoading } = useQuery({
    queryKey: ['run', id],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${id}`)
      return res.json()
    }
  })

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/runs/${id}/analyze`, { method: 'POST' })
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run', id] }),
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading run details...</div>
  if (!run || run.error) return <div className="p-8 text-center text-slate-500">Run not found</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/runs">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Run Details</h2>
          <p className="text-muted-foreground font-mono text-xs">{run.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Task Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-slate-500">Objective</h4>
              <p className="text-base mt-1">{run.task}</p>
            </div>
            <div className="flex space-x-4">
              <div>
                <h4 className="text-sm font-medium text-slate-500">Agent</h4>
                <Badge variant="outline" className="mt-1">{run.agent?.name}</Badge>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-500">Status</h4>
                <Badge variant={run.status === 'completed' ? 'default' : run.status === 'blocked' ? 'destructive' : 'default'} className="mt-1">
                  {run.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Risk Analysis</CardTitle>
            <Button variant="outline" size="sm" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
              <RefreshCw className={`w-3 h-3 mr-2 ${analyzeMutation.isPending ? 'animate-spin' : ''}`} />
              {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {run.riskScore !== null ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Risk Score</span>
                  <span className={`text-lg font-bold ${getRiskTextColor(run.riskScore)}`}>{run.riskScore}/100</span>
                </div>
                <RiskScoreBar score={run.riskScore} showLabel={false} size="md" />
                {run.summary && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-500">Summary</h4>
                    <p className="text-sm mt-1 text-slate-700">{run.summary}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-slate-500 text-center py-4">
                Run has not been analyzed yet. Click Analyze to generate a risk score.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Execution Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
            {run.steps?.map((step: any) => (
              <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${step.classification === 'blocked' ? 'bg-red-500' : step.classification === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                  {step.actionType === 'reasoning' ? <BrainCircuit className="w-4 h-4 text-white" /> : <Wrench className="w-4 h-4 text-white" />}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <span>{step.actionName}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{step.actionType}</Badge>
                    </div>
                    <time className="font-mono text-xs text-slate-500">Step {step.sequence}</time>
                  </div>
                  <div className="text-sm text-slate-600 mt-2">
                    <div className="font-medium text-xs text-slate-500 mb-1">Input</div>
                    <pre className="bg-slate-50 p-2 rounded text-[10px] overflow-x-auto">
                      {JSON.stringify(JSON.parse(step.actionInput || '{}'), null, 2)}
                    </pre>
                  </div>
                  <div className="text-sm text-slate-600 mt-2">
                    <div className="font-medium text-xs text-slate-500 mb-1">Output</div>
                    <pre className="bg-slate-50 p-2 rounded text-[10px] overflow-x-auto">
                      {JSON.stringify(JSON.parse(step.actionOutput || '{}'), null, 2)}
                    </pre>
                  </div>
                  {step.classification === 'blocked' && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-800 flex items-start">
                      <ShieldAlert className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                      <span>This action was blocked by security policies.</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
