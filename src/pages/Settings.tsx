import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Key, Webhook, Shield, Plus, Copy, Check } from "lucide-react"

export default function Settings() {
  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
              <p className="text-sm text-slate-500">Used for risk scoring and policy explanations.</p>
            </div>
            <Badge variant="default" className="bg-emerald-100 text-emerald-800">Configured</Badge>
          </div>
          <div className="flex justify-between items-center p-4 border rounded-md">
            <div>
              <h4 className="font-medium">Anthropic API</h4>
              <p className="text-sm text-slate-500">Required for Claude-based agents.</p>
            </div>
            <Badge variant="secondary">Not Configured</Badge>
          </div>
          <div className="flex justify-between items-center p-4 border rounded-md">
            <div>
              <h4 className="font-medium">OpenAI API</h4>
              <p className="text-sm text-slate-500">Required for GPT-based agents.</p>
            </div>
            <Badge variant="secondary">Not Configured</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Key className="w-5 h-5" />
              <span>SDK API Keys</span>
            </CardTitle>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" /> Generate Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
              <div>
                <p className="text-sm font-medium">Default SDK Key</p>
                <code className="text-xs text-slate-500">sk-safetyops-••••••••</code>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="text-[10px]">Created: Today</Badge>
                <Button variant="ghost" size="sm" onClick={() => handleCopy('sk-safetyops-example')}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Use SDK API keys to authenticate agent requests to the SafetyOps API.
              See the SDK documentation for integration details.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Webhook className="w-5 h-5" />
              <span>Webhooks</span>
            </CardTitle>
            <Button size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Add Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-500 text-center py-6">
            No webhooks configured. Add a webhook to receive real-time notifications when agents trigger security events.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
