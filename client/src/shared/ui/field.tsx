import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-2 text-sm text-foreground/88", className)}>
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground/88">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
