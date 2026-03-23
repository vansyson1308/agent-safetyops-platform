import { cn } from "@/lib/utils"

interface RiskScoreBarProps {
  score: number | null | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function getRiskColor(score: number): string {
  if (score > 75) return 'bg-red-500';
  if (score > 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function getRiskTextColor(score: number): string {
  if (score > 75) return 'text-red-500';
  if (score > 40) return 'text-amber-500';
  return 'text-emerald-500';
}

export default function RiskScoreBar({ score, showLabel = true, size = 'sm' }: RiskScoreBarProps) {
  const value = score || 0;
  const barHeight = size === 'sm' ? 'h-2.5' : 'h-2';

  return (
    <div className="flex items-center space-x-2">
      <div className={cn("w-full bg-slate-200 rounded-full max-w-[100px]", barHeight)}>
        <div
          className={cn("rounded-full", barHeight, getRiskColor(value))}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium">{value}</span>
      )}
    </div>
  );
}
