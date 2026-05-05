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
  title?: string;
  description?: string;
  fieldLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amount: number) => Promise<void>;
};

export function TopUpWalletDialog({
  open,
  isBusy,
  scope,
  targetLabel,
  title = "Пополнить кошелек",
  description,
  fieldLabel = "Сумма, RUB",
  placeholder = "Например, 1500",
  submitLabel = "Подтвердить",
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
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Введите целую сумму больше нуля.");
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              (scope === "project"
                ? `Укажите сумму в рублях для проекта «${targetLabel}». Эта сумма будет применена к каждому профилю проекта.`
                : `Укажите сумму в рублях для профиля «${targetLabel}».`)}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Field label={fieldLabel}>
            <Input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={placeholder}
              required
            />
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => handleOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Создаю задачу..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
