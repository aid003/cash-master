"use client";

import { Shield, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/features/session/model/session-provider";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

export function AuthScreen() {
  const router = useRouter();
  const { authMode, authenticate, clearError, error, isSubmitting, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/projects");
    }
  }, [router, status]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-8">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading Cash Master…
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(58,120,255,0.2),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(21,182,138,0.16),transparent_22%),linear-gradient(160deg,#050816_0%,#090f1c_48%,#060913_100%)]" />
      <div className="absolute inset-y-0 left-[8%] w-px bg-gradient-to-b from-transparent via-white/14 to-transparent" />
      <div className="absolute inset-y-0 right-[16%] w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />
      <section className="mx-auto grid min-h-screen max-w-[1480px] grid-cols-[1.15fr_0.85fr] gap-10 px-10 py-10">
        <div className="flex flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.035] p-10 backdrop-blur-xl">
          <div className="space-y-7">
            <Badge variant="accent" className="w-fit">
              <Shield className="mr-2 size-3.5" />
              Cash Master Ops
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl font-heading text-6xl font-semibold tracking-[-0.04em] text-foreground">
                Desktop-панель для проектов, профилей Undetectable и пакетных запусков.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Новый shell разделяет управление проектами, реестр профилей, jobs и
                системные настройки, чтобы рабочие сценарии не были свалены в одно
                полотно.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              ["Projects", "Создание, отбор и bulk-операции по проекту"],
              ["Profiles", "Старт/стоп, привязка и текущий статус профиля"],
              ["Jobs", "История выполнения и итог по каждому item"],
            ].map(([title, text]) => (
              <Card key={title} className="bg-black/20">
                <CardContent className="py-5">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="my-auto">
          <CardHeader>
            <Badge variant={authMode === "bootstrap" ? "warning" : "info"} className="w-fit">
              <Sparkles className="mr-2 size-3.5" />
              {authMode === "bootstrap" ? "Bootstrap" : "Admin Login"}
            </Badge>
            <CardTitle className="text-3xl">
              {authMode === "bootstrap"
                ? "Создайте первого администратора"
                : "Войдите в панель управления"}
            </CardTitle>
            <CardDescription>
              {authMode === "bootstrap"
                ? "Экран bootstrap доступен только если в базе ещё нет администратора."
                : "Если администратор уже существует, система всегда открывает обычный вход."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                clearError();
                void authenticate({ email, password }).then((ok) => {
                  if (ok) {
                    setPassword("");
                    router.replace("/projects");
                  }
                });
              }}
            >
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field label="Password" hint={authMode === "bootstrap" ? "min 8 symbols" : undefined}>
                <Input
                  type="password"
                  autoComplete={
                    authMode === "bootstrap" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Button
                type="submit"
                size="lg"
                className="mt-2 h-12 rounded-2xl"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Processing..."
                  : authMode === "bootstrap"
                    ? "Create admin"
                    : "Sign in"}
              </Button>
            </form>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
