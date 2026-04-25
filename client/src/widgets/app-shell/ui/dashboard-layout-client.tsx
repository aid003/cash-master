"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { CashMasterDataProvider } from "@/features/cash-master/model/cash-master-data-provider";
import { useSession } from "@/features/session/model/session-provider";
import { Card, CardContent } from "@/shared/ui/card";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export function DashboardLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center px-8">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Подготавливаю рабочее пространство…
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <CashMasterDataProvider>
      <AppShell>{children}</AppShell>
    </CashMasterDataProvider>
  );
}
