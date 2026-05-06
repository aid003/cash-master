"use client";

import { Coins, Play, SquareSlash } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type BusinessActionsProps = {
  mode?: "panel" | "compact";
  showTopUpWallet?: boolean;
  disabled?: boolean;
  onDisableAds: () => void;
  onLaunchAds: () => void;
  onTopUpWallet: () => void;
};

export function BusinessActions({
  mode = "panel",
  showTopUpWallet = true,
  disabled,
  onDisableAds,
  onLaunchAds,
  onTopUpWallet,
}: BusinessActionsProps) {
  const compact = mode === "compact";

  return (
    <div
      className={cn(
        "grid gap-2",
        compact
          ? "grid-cols-1"
          : showTopUpWallet
            ? "grid-cols-1"
            : "grid-cols-1",
      )}
    >
      <Button
        disabled={disabled}
        variant="outline"
        className={cn(
          "w-full",
          compact ? "h-10" : "h-12 justify-center px-4 text-[0.95rem]",
        )}
        onClick={onDisableAds}
      >
        <SquareSlash className="size-4" />
        Отключить рекламу
      </Button>
      <Button
        disabled={disabled}
        variant="outline"
        className={cn(
          "w-full",
          compact ? "h-10" : "h-12 justify-center px-4 text-[0.95rem]",
        )}
        onClick={onLaunchAds}
      >
        <Play className="size-4" />
        Запустить рекламу
      </Button>
      {showTopUpWallet ? (
        <Button
          disabled={disabled}
          variant="outline"
          className={cn(
            "w-full",
            compact ? "h-10" : "h-12 justify-center px-4 text-[0.95rem]",
          )}
          onClick={onTopUpWallet}
        >
          <Coins className="size-4" />
          Пополнить кошелек
        </Button>
      ) : null}
    </div>
  );
}
