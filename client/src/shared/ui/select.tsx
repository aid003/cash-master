import type { SelectHTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm text-foreground outline-none transition focus:border-primary/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
