import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield } from "lucide-react"
import ApiKeysCard from "@/components/ApiKeysCard"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export default function Settings() {
  const { can } = useAuth()

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api<{ gemini: boolean }>("/settings/integrations"),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage platform configurations and integrations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5" />
            <span>AI Provider Integrations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-4 border rounded-md">
            <div>
              <h4 className="font-medium">Google Gemini API</h4>
              <p className="text-sm text-slate-500">
                Used for run risk analysis and browser action risk scoring. Set <code>GEMINI_API_KEY</code> on the server to enable it.
              </p>
            </div>
            {isLoading ? null : integrations?.gemini ? (
              <Badge variant="default" className="bg-emerald-100 text-emerald-800">Configured</Badge>
            ) : (
              <Badge variant="secondary">Not Configured</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {can('manage') && <ApiKeysCard />}
    </div>
  )
}
