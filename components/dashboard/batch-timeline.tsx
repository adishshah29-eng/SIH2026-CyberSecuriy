import { cn } from "@/lib/utils";

export interface TimelineStep {
  icon: string;
  label: string;
  done: boolean;
  meta?: string;
}

export function BatchTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li key={step.label} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-base",
                step.done
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-neutral-300 bg-neutral-50 grayscale opacity-60",
              )}
            >
              {step.icon}
            </div>
            {i < steps.length - 1 && (
              <div className={cn("w-0.5 flex-1 min-h-6", step.done ? "bg-emerald-300" : "bg-neutral-200")} />
            )}
          </div>
          <div className="pb-6">
            <p
              className={cn(
                "text-sm font-medium",
                step.done ? "text-neutral-900" : "text-neutral-400",
              )}
            >
              {step.label}
            </p>
            {step.meta && <p className="text-xs text-neutral-500">{step.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
