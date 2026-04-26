"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { toastOptions, ...restProps } = props;

  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast:
            "rounded-[1.5rem] border border-white/10 bg-card/96 p-4 shadow-[0_28px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-xl",
          title: "text-sm font-semibold text-foreground",
          description: "text-sm leading-6 text-muted-foreground",
          actionButton:
            "rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
          cancelButton:
            "rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-foreground",
          closeButton:
            "border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08]",
        },
      }}
      {...restProps}
    />
  );
}
