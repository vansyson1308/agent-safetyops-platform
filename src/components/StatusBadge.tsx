import { Activity, CheckCircle, ShieldAlert, PauseCircle, XCircle } from "lucide-react"

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { icon: typeof Activity; className: string }> = {
  running: { icon: Activity, className: 'text-blue-500 animate-pulse' },
  active: { icon: Activity, className: 'text-blue-500 animate-pulse' },
  completed: { icon: CheckCircle, className: 'text-emerald-500' },
  blocked: { icon: ShieldAlert, className: 'text-red-500' },
  failed: { icon: XCircle, className: 'text-red-500' },
  paused: { icon: PauseCircle, className: 'text-amber-500' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.running;
  const Icon = config.icon;

  return (
    <div className="flex items-center space-x-2">
      <Icon className={`w-4 h-4 ${config.className}`} />
      <span className="capitalize text-sm font-medium">{status}</span>
    </div>
  );
}
