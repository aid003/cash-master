"use client";

import { toast } from "sonner";

type ToastMessage<T> = string | ((value: T) => string);

function resolveMessage<T>(message: ToastMessage<T>, value: T) {
  return typeof message === "function" ? message(value) : message;
}

export async function runToastAction<T>({
  action,
  loadingMessage,
  successMessage,
  onSuccess,
}: {
  action: () => Promise<T>;
  loadingMessage: string;
  successMessage: ToastMessage<T>;
  onSuccess?: (result: T) => Promise<void> | void;
}) {
  const toastId = toast.loading(loadingMessage);

  try {
    const result = await action();
    await onSuccess?.(result);
    toast.success(resolveMessage(successMessage, result), { id: toastId });
    return result;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Операция завершилась с ошибкой",
      { id: toastId },
    );
    throw error;
  }
}
