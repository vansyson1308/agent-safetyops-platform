import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Agent } from "@/types"
import { api } from "@/lib/api"

interface AgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null; // null = create mode, Agent = edit mode
}

export default function AgentDialog({ open, onOpenChange, agent }: AgentDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!agent;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<string>("Gemini");
  const [trustLevel, setTrustLevel] = useState<string>("medium");
  const [capabilities, setCapabilities] = useState("");
  const [maxTokenBudget, setMaxTokenBudget] = useState("");
  const [actionBudget, setActionBudget] = useState("");
  const [approvalMode, setApprovalMode] = useState(true);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description || "");
      setProvider(agent.provider);
      setTrustLevel(agent.trustLevel);
      setCapabilities(JSON.parse(agent.capabilities || "[]").join(", "));
      setMaxTokenBudget(agent.maxTokenBudget?.toString() || "");
      setActionBudget(agent.actionBudget?.toString() || "");
      setApprovalMode(agent.approvalMode);
    } else {
      setName(""); setDescription(""); setProvider("Gemini"); setTrustLevel("medium");
      setCapabilities(""); setMaxTokenBudget(""); setActionBudget(""); setApprovalMode(true);
    }
  }, [agent, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || undefined,
        provider,
        trustLevel,
        capabilities: capabilities.split(",").map(c => c.trim()).filter(Boolean),
        maxTokenBudget: maxTokenBudget ? parseInt(maxTokenBudget) : undefined,
        actionBudget: actionBudget ? parseInt(actionBudget) : undefined,
        approvalMode,
      };
      return isEdit
        ? api(`/agents/${agent.id}`, { method: "PUT", body })
        : api("/agents", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>{isEdit ? "Configure Agent" : "Register New Agent"}</DialogTitle>
        <DialogDescription>{isEdit ? "Update agent configuration." : "Add a new AI agent to the platform."}</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="agent-form" onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Support Bot" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this agent do?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gemini">Gemini</SelectItem>
                  <SelectItem value="OpenAI">OpenAI</SelectItem>
                  <SelectItem value="Anthropic">Anthropic</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trust Level</Label>
              <Select value={trustLevel} onValueChange={setTrustLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capabilities">Capabilities (comma-separated)</Label>
            <Input id="capabilities" value={capabilities} onChange={e => setCapabilities(e.target.value)} placeholder="browser, email actions, CRM" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tokenBudget">Token Budget</Label>
              <Input id="tokenBudget" type="number" value={maxTokenBudget} onChange={e => setMaxTokenBudget(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actionBudget">Action Budget</Label>
              <Input id="actionBudget" type="number" value={actionBudget} onChange={e => setActionBudget(e.target.value)} placeholder="10" />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="approvalMode" checked={approvalMode} onChange={e => setApprovalMode(e.target.checked)} className="rounded border-slate-300" />
            <Label htmlFor="approvalMode">Require approval for high-risk actions</Label>
          </div>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button form="agent-form" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : isEdit ? "Update" : "Register"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
