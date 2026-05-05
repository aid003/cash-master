"use client";

import {
  ChevronDown,
  Link2,
  RefreshCw,
  Search,
  Unlink2,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import {
  formatDateTime,
  getStatusTone,
  prettifyStatus,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { BusinessActions } from "@/features/cash-master/ui/business-actions";
import { TechnicalActionsMenu } from "@/features/cash-master/ui/technical-actions-menu";
import { TopUpWalletDialog } from "@/features/cash-master/ui/top-up-wallet-dialog";
import { useAppUiStore } from "@/shared/store/app-ui-store";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Select } from "@/shared/ui/select";

export default function ProfilesPage() {
  const {
    assignProfileAction,
    disableAdsProfileAction,
    isHydrating,
    isMutating,
    launchAdsProfileAction,
    profiles,
    projects,
    syncProfilesAction,
    selectedProject,
    startProfileAction,
    stopProfileAction,
    topUpWalletProfileAction,
    unassignProfileAction,
  } = useCashMasterData();
  const profileSearch = useAppUiStore((state) => state.profileSearch);
  const setProfileSearch = useAppUiStore((state) => state.setProfileSearch);
  const deferredSearch = useDeferredValue(profileSearch);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [topUpTarget, setTopUpTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [disableAdsTarget, setDisableAdsTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const visibleProfiles = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (!query) {
      return profiles;
    }

    return profiles.filter((profile) =>
      [
        profile.name,
        profile.profileId,
        profile.folder ?? "",
        profile.project?.name ?? "",
        profile.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [deferredSearch, profiles]);

  return (
    <>
      <div className="grid gap-4">
        <Card>
          <CardHeader className="border-b border-white/6 pb-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Профили</CardTitle>
                <CardDescription>
                  Поиск по имени, ID, папке, тегам и текущему проекту.
                </CardDescription>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
                <div className="flex h-10 items-center rounded-2xl border border-white/8 bg-white/[0.035] pl-4 transition focus-within:border-primary/40 focus-within:bg-white/[0.05] focus-within:ring-2 focus-within:ring-primary/15">
                  <Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
                  <input
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                    className="h-full w-full bg-transparent px-3 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                    placeholder="Поиск по профилям, тегам и проекту"
                  />
                </div>
                <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Текущий проект
                  </p>
                  <p className="mt-2 truncate text-sm font-semibold text-foreground">
                    {selectedProject?.name ?? "Не выбран"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={isHydrating || isMutating}
                  className="h-10 w-full"
                  onClick={() => void syncProfilesAction()}
                >
                  <RefreshCw className="size-4" />
                  Подтянуть профили
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4">
          {visibleProfiles.map((profile) => {
            const isOperational = !profile.isMissing;
            const assignmentValue = assignmentTargets[profile.id] ?? selectedProject?.id ?? "";

            return (
              <Card key={profile.id}>
                <CardContent className="grid gap-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{profile.name}</p>
                        <Badge variant={getStatusTone(profile.status)}>
                          {prettifyStatus(profile.status)}
                        </Badge>
                        {profile.project ? (
                          <Badge variant="accent">{profile.project.name}</Badge>
                        ) : (
                          <Badge variant="neutral">Без проекта</Badge>
                        )}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{profile.profileId}</p>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {profile.isMissing
                          ? "Профиль недоступен в Undetectable."
                          : "Основные действия доступны ниже."}
                      </p>
                    </div>

                    <TechnicalActionsMenu
                      disabled={isMutating || !isOperational}
                      onStart={() => void startProfileAction(profile.id, profile.name)}
                      onStop={() => void stopProfileAction(profile.id, profile.name)}
                    />
                  </div>

                  <BusinessActions
                    mode="compact"
                    disabled={isMutating || !isOperational}
                    onDisableAds={() =>
                      setDisableAdsTarget({
                        id: profile.id,
                        name: profile.name,
                      })
                    }
                    onLaunchAds={() => void launchAdsProfileAction(profile.id, profile.name)}
                    onTopUpWallet={() =>
                      setTopUpTarget({
                        id: profile.id,
                        name: profile.name,
                      })
                    }
                  />

                  <div className="grid gap-3 rounded-[1.35rem] border border-white/8 bg-white/[0.02] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Привязка к проекту</p>
                      {profile.project ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-muted-foreground">
                            Профиль уже привязан к проекту {profile.project.name}.
                          </p>
                          <Button
                            variant="outline"
                            disabled={isMutating}
                            onClick={() => void unassignProfileAction(profile.id, profile.name)}
                          >
                            <Unlink2 className="size-4" />
                            Отвязать
                          </Button>
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_auto]">
                          <Select
                            value={assignmentValue}
                            onChange={(event) =>
                              setAssignmentTargets((current) => ({
                                ...current,
                                [profile.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Выберите проект</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="outline"
                            disabled={isMutating || !assignmentValue}
                            onClick={() =>
                              void assignProfileAction(
                                profile.id,
                                assignmentValue,
                                profile.name,
                              )
                            }
                          >
                            <Link2 className="size-4" />
                            Привязать к проекту
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <details className="group rounded-[1.35rem] border border-white/8 bg-white/[0.02]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-foreground/78">
                      Технические детали
                      <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-3 border-t border-white/6 px-4 py-4 text-sm text-muted-foreground lg:grid-cols-2">
                      <p>Папка: {profile.folder ?? "—"}</p>
                      <p>Debug: {profile.debugPort ?? "—"}</p>
                      <p>Последняя синхронизация: {formatDateTime(profile.lastSeenAt)}</p>
                      <p>
                        Теги: {profile.tags.length > 0 ? profile.tags.join(", ") : "—"}
                      </p>
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}

          {visibleProfiles.length === 0 ? (
            <Card className="bg-white/[0.03]">
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                По текущему запросу профили не найдены.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <TopUpWalletDialog
        open={Boolean(topUpTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setTopUpTarget(null);
          }
        }}
        isBusy={isMutating}
        scope="profile"
        targetLabel={topUpTarget?.name ?? ""}
        onSubmit={async (amount) => {
          if (!topUpTarget) {
            return;
          }

          await topUpWalletProfileAction(topUpTarget.id, topUpTarget.name, amount);
        }}
      />

      <TopUpWalletDialog
        open={Boolean(disableAdsTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDisableAdsTarget(null);
          }
        }}
        isBusy={isMutating}
        scope="profile"
        targetLabel={disableAdsTarget?.name ?? ""}
        title="Отключить рекламу"
        description={
          disableAdsTarget
            ? `Укажите сумму в рублях для профиля «${disableAdsTarget.name}». Средства будут переведены из аванса в кошелек Avito.`
            : "Укажите сумму в рублях."
        }
        placeholder="Например, 1000"
        submitLabel="Создать задачу"
        onSubmit={async (amount) => {
          if (!disableAdsTarget) {
            return;
          }

          await disableAdsProfileAction(disableAdsTarget.id, disableAdsTarget.name, amount);
        }}
      />
    </>
  );
}
