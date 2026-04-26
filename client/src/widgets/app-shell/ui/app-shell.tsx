"use client";

import { FolderKanban, History, Settings2, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { ScrollArea } from "@/shared/ui/scroll-area";

const navigationItems = [
  { href: "/projects", label: "Проекты", icon: FolderKanban },
  { href: "/profiles", label: "Профили", icon: Shield },
  { href: "/jobs", label: "Задачи", icon: History },
  { href: "/settings", label: "Настройки", icon: Settings2 },
  { href: "/account", label: "Аккаунт", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-screen grid-cols-[116px_1fr] bg-transparent lg:grid-cols-[128px_1fr]">
      <aside className="border-r border-white/6 bg-sidebar/70 px-4 py-5 backdrop-blur-xl">
        <div className="flex h-full flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <nav className="grid gap-4">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full min-w-0 flex-col items-center gap-2 px-2 py-2 text-center text-xs font-medium transition",
                      active
                        ? "text-foreground"
                        : "text-foreground/58 hover:text-foreground/78",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-foreground/50")} />
                    <span className="whitespace-nowrap text-center leading-tight">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-4 lg:px-6 lg:py-5">{children}</main>
    </div>
  );
}
