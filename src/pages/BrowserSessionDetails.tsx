import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Globe, MousePointerClick, Type, ScanText, Camera, ShieldAlert, Plus } from "lucide-react"

export default function BrowserSessionDetails() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  
  const [actionType, setActionType] = useState("navigate")
  const [target, setTarget] = useState("")
  const [value, setValue] = useState("")

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['browser-session', id],
    queryFn: async () => {
      const res = await fetch(`/api/browser-sessions/${id}`)
      if (!res.ok) throw new Error('Failed to fetch session details')
      return res.json()
    }
  })

  const actionMutation = useMutation({
    mutationFn: async (actionData: any) => {
      const res = await fetch('/api/browser-sessions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData)
      })
      if (!res.ok) throw new Error('Failed to process action')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-session', id] })
      setTarget("")
      setValue("")
    }
  })

  const handleActionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    actionMutation.mutate({
      sessionId: id,
      actionType,
      target: target || undefined,
      value: value || undefined
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-slate-500">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading session details...</p>
        </div>
      </div>
    )
  }

  if (error || !session || session.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <ShieldAlert className="w-8 h-8 mx-auto mb-4" />
          <p>Session not found or error loading details.</p>
          <Link to="/browser-sessions">
            <Button variant="outline" className="mt-4">Back to Sessions</Button>
          </Link>
        </div>
      </div>
    )
  }

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'navigate': return <Globe className="w-4 h-4 text-white" />
      case 'click': return <MousePointerClick className="w-4 h-4 text-white" />
      case 'type': return <Type className="w-4 h-4 text-white" />
      case 'extract_text': return <ScanText className="w-4 h-4 text-white" />
      case 'screenshot': return <Camera className="w-4 h-4 text-white" />
      default: return <Globe className="w-4 h-4 text-white" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/browser-sessions">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Session Replay</h2>
          <p className="text-muted-foreground font-mono text-xs">{session.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Session Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-slate-500">Initial URL</h4>
              <p className="text-base mt-1 font-mono text-sm">{session.url}</p>
            </div>
            <div className="flex space-x-4">
              <div>
                <h4 className="text-sm font-medium text-slate-500">Agent</h4>
                <Badge variant="outline" className="mt-1">{session.agent?.name || 'Unknown'}</Badge>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-500">Status</h4>
                <Badge variant={session.status === 'completed' ? 'safe' : session.status === 'blocked' ? 'destructive' : 'warning'} className="mt-1">
                  {session.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Max Risk Score</span>
              <span className={`text-lg font-bold ${session.riskScore > 75 ? 'text-red-500' : session.riskScore > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {session.riskScore || 0}/100
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${session.riskScore > 75 ? 'bg-red-500' : session.riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                style={{ width: `${session.riskScore || 0}%` }}
              ></div>
            </div>
            {session.summary && (
              <div>
                <h4 className="text-xs font-medium text-slate-500">Summary</h4>
                <p className="text-sm mt-1 text-slate-700">{session.summary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Simulate Action</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleActionSubmit} className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Action Type</label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="navigate">Navigate</SelectItem>
                  <SelectItem value="click">Click</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                  <SelectItem value="extract_text">Extract Text</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Target (Selector/URL)</label>
              <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. #login-btn" />
            </div>
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Value (Text to type)</label>
              <Input value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. mypassword" disabled={actionType !== 'type'} />
            </div>
            <Button type="submit" disabled={actionMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Execute
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
            {session.actions?.map((action: any) => (
              <div key={action.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${action.classification === 'blocked' ? 'bg-red-500' : action.classification === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                  {getActionIcon(action.actionType)}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <span className="capitalize">{action.actionType}</span>
                    </div>
                    <time className="font-mono text-xs text-slate-500">Step {action.sequence}</time>
                  </div>
                  
                  {action.target && (
                    <div className="text-sm text-slate-600 mt-2">
                      <div className="font-medium text-xs text-slate-500 mb-1">Target</div>
                      <code className="bg-slate-50 px-1 py-0.5 rounded text-xs">{action.target}</code>
                    </div>
                  )}
                  
                  {action.value && (
                    <div className="text-sm text-slate-600 mt-2">
                      <div className="font-medium text-xs text-slate-500 mb-1">Value</div>
                      <code className="bg-slate-50 px-1 py-0.5 rounded text-xs">{action.value}</code>
                    </div>
                  )}

                  {action.explanation && (
                    <div className="mt-3 p-2 bg-slate-50 border border-slate-100 rounded text-xs text-slate-700">
                      <span className="font-semibold block mb-1">AI Risk Assessment:</span>
                      {action.explanation}
                    </div>
                  )}

                  {action.classification === 'blocked' && (
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
