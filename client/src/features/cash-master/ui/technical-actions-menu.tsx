"use client";

import { CirclePlay, CircleStop, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type TechnicalActionsMenuProps = {
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  align?: "start" | "center" | "end";
};

export function TechnicalActionsMenu({
  disabled,
  onStart,
  onStop,
  align = "end",
}: TechnicalActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-4 text-[0.95rem] font-medium text-foreground transition hover:bg-white/[0.05] disabled:pointer-events-none disabled:opacity-50"
      >
        Действия
        <ChevronDown className="size-4 text-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48 rounded-xl border border-white/8 bg-popover p-1.5">
        <DropdownMenuItem onClick={onStart}>
          <CirclePlay className="size-4" />
          Старт
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onStop}>
          <CircleStop className="size-4" />
          Стоп
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
