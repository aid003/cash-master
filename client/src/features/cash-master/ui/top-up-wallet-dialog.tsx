"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

type TopUpWalletDialogProps = {
  open: boolean;
  isBusy?: boolean;
  scope: "project" | "profile";
  targetLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amount: number) => Promise<void>;
};

export function TopUpWalletDialog({
  open,
  isBusy,
  scope,
  targetLabel,
  onOpenChange,
  onSubmit,
}: TopUpWalletDialogProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setAmount("");
      setError("");
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Введите сумму больше нуля.");
      return;
    }

    setError("");
    await onSubmit(parsed);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Пополнить кошелек</DialogTitle>
          <DialogDescription>
            {scope === "project"
              ? `Укажите сумму в рублях для проекта «${targetLabel}». Эта сумма будет применена к каждому профилю проекта.`
              : `Укажите сумму в рублях для профиля «${targetLabel}».`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Field label="Сумма, RUB">
            <Input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Например, 1500"
              required
            />
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Создаю задачу..." : "Подтвердить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
