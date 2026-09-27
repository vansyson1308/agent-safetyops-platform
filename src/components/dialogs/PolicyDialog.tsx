import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Policy } from "@/types"
import { api } from "@/lib/api"

interface PolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: Policy | null;
}

export default function PolicyDialog({ open, onOpenChange, policy }: PolicyDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!policy;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<string>("global");
  const [blockedTools, setBlockedTools] = useState("");
  const [blockedDomains, setBlockedDomains] = useState("");
  const [restrictedActions, setRestrictedActions] = useState("");
  const [maxSpend, setMaxSpend] = useState("");
  const [maxStepsPerRun, setMaxStepsPerRun] = useState("");
  const [severityThreshold, setSeverityThreshold] = useState("50");

  useEffect(() => {
    if (policy) {
      setName(policy.name);
      setDescription(policy.description || "");
      setScope(policy.scope);
      setBlockedTools(JSON.parse(policy.blockedTools || "[]").join(", "));
      setBlockedDomains(JSON.parse(policy.blockedDomains || "[]").join(", "));
      setRestrictedActions(JSON.parse(policy.restrictedActions || "[]").join(", "));
      setMaxSpend(policy.maxSpend?.toString() || "");
      setMaxStepsPerRun(policy.maxStepsPerRun?.toString() || "");
      setSeverityThreshold(policy.severityThreshold?.toString() || "50");
    } else {
      setName(""); setDescription(""); setScope("global"); setBlockedTools("");
      setBlockedDomains(""); setRestrictedActions(""); setMaxSpend(""); setMaxStepsPerRun(""); setSeverityThreshold("50");
    }
  }, [policy, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || undefined,
        scope,
        blockedTools: blockedTools.split(",").map(s => s.trim()).filter(Boolean),
        blockedDomains: blockedDomains.split(",").map(s => s.trim()).filter(Boolean),
        restrictedActions: restrictedActions.split(",").map(s => s.trim()).filter(Boolean),
        maxSpend: maxSpend ? parseFloat(maxSpend) : undefined,
        maxStepsPerRun: maxStepsPerRun ? parseInt(maxStepsPerRun) : undefined,
        severityThreshold: parseInt(severityThreshold),
      };
      return isEdit
        ? api(`/policies/${policy.id}`, { method: "PUT", body })
        : api("/policies", { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Policy" : "Create New Policy"}</DialogTitle>
        <DialogDescription>{isEdit ? "Update policy configuration." : "Define a new security policy for agent behavior."}</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="policy-form" onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Strict Financial Controls" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this policy enforce?" />
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="agent">Agent-specific</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="blockedTools">Blocked Tools (comma-separated)</Label>
            <Input id="blockedTools" value={blockedTools} onChange={e => setBlockedTools(e.target.value)} placeholder="wire_transfer, delete_account" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blockedDomains">Blocked Domains (comma-separated)</Label>
            <Input id="blockedDomains" value={blockedDomains} onChange={e => setBlockedDomains(e.target.value)} placeholder="malicious.org, competitor.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restrictedActions">Restricted Actions (require approval)</Label>
            <Input id="restrictedActions" value={restrictedActions} onChange={e => setRestrictedActions(e.target.value)} placeholder="issue_refund, send_email" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxSpend">Max Spend ($)</Label>
              <Input id="maxSpend" type="number" step="0.01" value={maxSpend} onChange={e => setMaxSpend(e.target.value)} placeholder="50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSteps">Max Steps</Label>
              <Input id="maxSteps" type="number" value={maxStepsPerRun} onChange={e => setMaxStepsPerRun(e.target.value)} placeholder="15" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity (0-100)</Label>
              <Input id="severity" type="number" min="0" max="100" value={severityThreshold} onChange={e => setSeverityThreshold(e.target.value)} />
            </div>
          </div>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button form="policy-form" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
