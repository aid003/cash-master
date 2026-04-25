"use client";

import {
  CircleDot,
  FolderKanban,
  History,
  LogOut,
  Settings2,
  Shield,
  UserRound,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { useSession } from "@/features/session/model/session-provider";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { ScrollArea } from "@/shared/ui/scroll-area";

const navigationItems = [
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/profiles", label: "Профили", icon: Shield },
  { href: "/jobs", label: "Задачи", icon: History },
  { href: "/settings", label: "Настройки", icon: Settings2 },
  { href: "/account", label: "Аккаунт", icon: UserRound },
];

function pageCopy(pathname: string) {
  if (pathname.startsWith("/profiles")) {
    return {
      title: "Профили",
      text: "Поиск, привязка и быстрые действия.",
    };
  }

  if (pathname.startsWith("/jobs")) {
    return {
      title: "Задачи",
      text: "История выполнения и статусы.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "Настройки",
      text: "Подключение к API и проверка доступа.",
    };
  }

  if (pathname.startsWith("/account")) {
    return {
      title: "Аккаунт",
      text: "Текущая учётная запись администратора.",
    };
  }

  return {
    title: "Проекты",
    text: "Список, сводка и быстрые действия.",
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { connectionSettings, feedback, isMutating, selectedProject } = useCashMasterData();
  const { signOut, user } = useSession();
  const copy = pageCopy(pathname);

  return (
    <div className="grid min-h-screen grid-cols-[244px_1fr] bg-transparent">
      <aside className="border-r border-white/6 bg-sidebar/85 px-4 py-4 backdrop-blur-xl">
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center justify-between rounded-[1.4rem] border border-white/6 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Cash Master</p>
              <p className="text-xs text-muted-foreground">graphite shell</p>
            </div>
            <CircleDot className="size-4 text-primary" />
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <nav className="grid gap-1.5 pr-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-[1.15rem] border px-3.5 py-3 text-sm font-medium transition",
                      active
                        ? "border-white/8 bg-white/[0.075] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
                        : "border-transparent text-foreground/66 hover:border-white/6 hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-foreground/55")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          <Card className="bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Wifi className="size-4 text-primary" />
              API
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {connectionSettings?.baseUrl ?? "Endpoint не задан"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {connectionSettings?.source ? `Источник: ${connectionSettings.source}` : "Источник: —"}
            </p>
          </Card>

          <Card className="bg-white/[0.03] p-4">
            <p className="truncate text-sm font-medium text-foreground">{user?.email ?? "—"}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {user?.role ?? "ADMIN"}
            </p>
            <Button variant="outline" className="mt-3 w-full" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Выйти
            </Button>
          </Card>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-white/6 bg-background/84 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {copy.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{copy.text}</p>
            </div>

            <div className="flex min-w-[320px] flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                {selectedProject ? (
                  <Badge variant="accent">{selectedProject.name}</Badge>
                ) : null}
                <Badge variant={isMutating ? "warning" : "neutral"}>
                  {isMutating ? "Обновление" : "Готово"}
                </Badge>
              </div>
              {feedback ? (
                <div
                  className={cn(
                    "max-w-md rounded-2xl border px-4 py-2.5 text-sm",
                    feedback.tone === "danger" &&
                      "border-rose-500/20 bg-rose-500/10 text-rose-200",
                    feedback.tone === "success" &&
                      "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
                    feedback.tone === "info" &&
                      "border-sky-500/20 bg-sky-500/10 text-sky-200",
                  )}
                >
                  {feedback.text}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-89px)] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
