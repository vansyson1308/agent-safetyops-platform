import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, ShieldAlert, CheckCircle, Bot } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { DashboardStats } from "@/types"
import { api } from "@/lib/api"

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      return api<DashboardStats>('/dashboard/stats')
    }
  })

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: async () => {
      return api('/dashboard/chart-data?days=7')
    }
  })

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Runs</CardTitle>
            <Activity className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRuns || 0}</div>
            <p className="text-xs text-slate-500">All time executions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Blocked Actions</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.blockedRuns || 0}</div>
            <p className="text-xs text-slate-500">Policy violations caught</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Approvals</CardTitle>
            <CheckCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.approvalRequiredRuns || 0}</div>
            <p className="text-xs text-slate-500">Requires immediate attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats?.agentsCount || 0}</div>
            <p className="text-xs text-slate-500">Registered and active</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Execution Volume & Interventions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="runs" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Total Runs" />
                  <Bar dataKey="blocked" fill="#ef4444" radius={[4, 4, 0, 0]} name="Blocked" />
                  <Bar dataKey="approvals" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Approvals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentIncidents?.map((incident: any) => (
                <div key={incident.id} className="flex items-start space-x-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="w-2 h-2 mt-2 rounded-full bg-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{incident.title}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{incident.summary}</p>
                  </div>
                </div>
              ))}
              {(!stats?.recentIncidents || stats.recentIncidents.length === 0) && (
                <div className="text-sm text-slate-500 text-center py-4">No recent incidents</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
