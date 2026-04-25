import Link from "next/link";

import { Button, buttonVariants } from "@/shared/ui/button";

const fsdLayers = ["app", "widgets", "features", "entities", "shared"];

export function HomeScreen() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(31,111,235,0.18),_transparent_32%),radial-gradient(circle_at_85%_18%,_rgba(245,158,11,0.18),_transparent_26%),linear-gradient(180deg,_var(--background),_var(--muted))]" />
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-6 py-16 md:px-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
          <span className="size-2 rounded-full bg-primary" />
          Next.js 16 + TypeScript + shadcn/ui + FSD
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-primary">
                Cash Master Client
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
                Клиент инициализирован с App Router и FSD без layers pages и
                processes.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                В слое app остаётся только маршрутизация Next.js. UI и доменная
                структура вынесены в widgets, features, entities и shared.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="h-11 px-6 text-sm font-semibold">
                База проекта готова
              </Button>
              <Link
                href="https://ui.shadcn.com/docs"
                target="_blank"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-11 px-6 text-sm",
                })}
              >
                Документация shadcn/ui
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/70 bg-card/85 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur">
            <p className="mb-5 text-sm font-medium text-muted-foreground">
              Базовые FSD-слои
            </p>
            <div className="grid gap-3">
              {fsdLayers.map((layer) => (
                <div
                  key={layer}
                  className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                >
                  <span className="font-mono text-sm text-foreground">
                    src/{layer}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
