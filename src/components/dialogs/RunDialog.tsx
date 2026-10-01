import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Agent } from "@/types"
import { api } from "@/lib/api"

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RunDialog({ open, onOpenChange }: RunDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("");

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      return api<Agent[]>("/agents");
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      return api("/runs", { method: "POST", body: { task, agentId } });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onOpenChange(false);
      navigate(`/runs/${data.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Start New Run</DialogTitle>
        <DialogDescription>Create a new agent execution run.</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="run-form" onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task">Task Description</Label>
            <Input id="task" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Process refund for order #12345" required />
          </div>
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId} required>
              <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
              <SelectContent>
                {agents?.filter((a: Agent) => a.status === 'active').map((agent: Agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button form="run-form" type="submit" disabled={mutation.isPending || !agentId}>
          {mutation.isPending ? "Starting..." : "Start Run"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
