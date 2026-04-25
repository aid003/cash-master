import type { HTMLAttributes } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        neutral: "border-white/8 bg-white/[0.04] text-foreground/78",
        success: "border-emerald-500/18 bg-emerald-500/10 text-emerald-300",
        warning: "border-amber-500/18 bg-amber-500/10 text-amber-300",
        danger: "border-rose-500/18 bg-rose-500/10 text-rose-300",
        info: "border-sky-500/18 bg-sky-500/10 text-sky-300",
        accent: "border-primary/18 bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
