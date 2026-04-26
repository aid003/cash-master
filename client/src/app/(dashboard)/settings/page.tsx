"use client";

import { Cable, Save, TestTubeDiagonal } from "lucide-react";
import { useState } from "react";

import { formatDateTime } from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

function SettingsForm() {
  const {
    connectionSettings,
    isMutating,
    saveConnectionSettingsAction,
    testConnectionSettingsAction,
  } = useCashMasterData();
  const [protocol, setProtocol] = useState(connectionSettings?.protocol ?? "http");
  const [host, setHost] = useState(connectionSettings?.host ?? "127.0.0.1");
  const [port, setPort] = useState(String(connectionSettings?.port ?? 25325));
  const [isTesting, setIsTesting] = useState(false);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
      <Card className="bg-white/[0.03]">
        <CardHeader>
          <Badge variant="info" className="w-fit">
            <Cable className="mr-2 size-3.5" />
            Undetectable API
          </Badge>
          <CardTitle>Настройка endpoint</CardTitle>
          <CardDescription>
            Host и port для backend и фоновых задач.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-[140px_1fr_180px] gap-4">
            <Field label="Protocol">
              <select
                value={protocol}
                onChange={(event) => setProtocol(event.target.value as "http" | "https")}
                disabled={isMutating || isTesting}
                className="flex h-10 w-full rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm uppercase text-foreground outline-none transition focus:border-primary/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </Field>
            <Field label="Host">
              <Input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                disabled={isMutating || isTesting}
              />
            </Field>
            <Field label="Port">
              <Input
                value={port}
                onChange={(event) => setPort(event.target.value)}
                disabled={isMutating || isTesting}
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={isMutating || isTesting}
              onClick={() => {
                setIsTesting(true);
                void testConnectionSettingsAction({
                  protocol,
                  host: host.trim(),
                  port: Number(port),
                })
                  .finally(() => setIsTesting(false));
              }}
            >
              <TestTubeDiagonal className="size-4" />
              Проверить
            </Button>
            <Button
              disabled={isMutating || isTesting}
              onClick={() =>
                void saveConnectionSettingsAction({
                  protocol,
                  host: host.trim(),
                  port: Number(port),
                })
              }
            >
              <Save className="size-4" />
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Сводка подключения</CardTitle>
          <CardDescription>Последний сохранённый статус и источник.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <div>
            <p className="text-xs uppercase tracking-[0.18em]">Endpoint</p>
            <p className="mt-2 text-foreground">{connectionSettings?.baseUrl ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em]">Источник</p>
            <p className="mt-2 text-foreground">{connectionSettings?.source ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em]">Последняя проверка</p>
            <p className="mt-2 text-foreground">
              {formatDateTime(connectionSettings?.lastCheckedAt ?? null)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em]">Статус</p>
            <p className="mt-2 text-foreground">
              {connectionSettings?.lastCheckOk === null
                ? "Ещё не проверялся"
                : connectionSettings?.lastCheckOk
                  ? `Доступен, профилей: ${connectionSettings.lastProfileCount ?? 0}`
                  : connectionSettings?.lastCheckError ?? "Недоступен"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { connectionSettings } = useCashMasterData();

  return (
    <SettingsForm
      key={`${connectionSettings?.protocol ?? "http"}:${connectionSettings?.host ?? "127.0.0.1"}:${connectionSettings?.port ?? 25325}`}
    />
  );
}
