"use client";

import { Link2, RefreshCw, Search, Unlink2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  formatDateTime,
  getStatusTone,
  prettifyStatus,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { BusinessActions } from "@/features/cash-master/ui/business-actions";
import { TopUpWalletDialog } from "@/features/cash-master/ui/top-up-wallet-dialog";
import { cn } from "@/shared/lib/utils";
import { useAppUiStore } from "@/shared/store/app-ui-store";
import type { Profile } from "@/shared/api/cash-master";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";

const profileStatusFilters = [
  { value: "all", label: "Все статусы" },
  { value: "AVAILABLE", label: "Доступен" },
  { value: "STARTED", label: "Запущен" },
  { value: "LOCKED", label: "Заблокирован" },
  { value: "UNKNOWN", label: "Неизвестно" },
  { value: "MISSING", label: "Недоступен" },
] as const;

const assignmentFilters = [
  { value: "all", label: "Все профили" },
  { value: "assigned", label: "С проектом" },
  { value: "unassigned", label: "Без проекта" },
] as const;

function RegistryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-3 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  );
}

function ProfileRegistryRow({
  profile,
  selected,
  onSelect,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full gap-3 border-b border-white/6 px-4 py-3 text-left transition last:border-b-0",
        "lg:grid-cols-[minmax(0,2.3fr)_140px_150px_120px] lg:items-center lg:gap-4",
        selected
          ? "bg-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          : "bg-transparent hover:bg-white/[0.035]",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{profile.name}</p>
          <Badge variant={getStatusTone(profile.status)} className="hidden sm:inline-flex">
            {prettifyStatus(profile.status)}
          </Badge>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {profile.profileId}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground lg:hidden">
          <span>{profile.project?.name ?? "Без проекта"}</span>
          <span>•</span>
          <span>{profile.folder ?? "Папка не указана"}</span>
          <span>•</span>
          <span>{formatDateTime(profile.lastSeenAt)}</span>
        </div>
      </div>

      <div className="hidden lg:block">
        <p className="truncate text-sm text-foreground">{profile.project?.name ?? "Без проекта"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile.project ? "Привязан" : "Свободный"}
        </p>
      </div>

      <div className="hidden lg:block">
        <p className="truncate text-sm text-foreground">{profile.folder ?? "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Debug: {profile.debugPort ?? "—"}</p>
      </div>

      <div className="hidden lg:block">
        <p className="text-sm text-foreground">{formatDateTime(profile.lastSeenAt)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile.isMissing ? "Нет в Undetectable" : "Готов к действиям"}
        </p>
      </div>
    </button>
  );
}

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
  const profileStatusFilter = useAppUiStore((state) => state.profileStatusFilter);
  const profileAssignmentFilter = useAppUiStore((state) => state.profileAssignmentFilter);
  const selectedProfileId = useAppUiStore((state) => state.selectedProfileId);
  const setProfileSearch = useAppUiStore((state) => state.setProfileSearch);
  const setProfileStatusFilter = useAppUiStore((state) => state.setProfileStatusFilter);
  const setProfileAssignmentFilter = useAppUiStore(
    (state) => state.setProfileAssignmentFilter,
  );
  const setSelectedProfileId = useAppUiStore((state) => state.setSelectedProfileId);
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
  const [launchAdsTarget, setLaunchAdsTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const visibleProfiles = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return profiles
      .filter((profile) => {
        const matchesSearch =
          !query ||
          [
            profile.name,
            profile.profileId,
            profile.folder ?? "",
            profile.project?.name ?? "",
            profile.tags.join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

        const matchesStatus =
          profileStatusFilter === "all" || profile.status === profileStatusFilter;

        const matchesAssignment =
          profileAssignmentFilter === "all" ||
          (profileAssignmentFilter === "assigned" && Boolean(profile.project)) ||
          (profileAssignmentFilter === "unassigned" && !profile.project);

        return matchesSearch && matchesStatus && matchesAssignment;
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }, [deferredSearch, profileAssignmentFilter, profileStatusFilter, profiles]);

  useEffect(() => {
    if (visibleProfiles.length === 0) {
      if (selectedProfileId !== null) {
        setSelectedProfileId(null);
      }
      return;
    }

    const hasSelectedVisible = visibleProfiles.some((profile) => profile.id === selectedProfileId);
    if (!hasSelectedVisible) {
      setSelectedProfileId(visibleProfiles[0]?.id ?? null);
    }
  }, [selectedProfileId, setSelectedProfileId, visibleProfiles]);

  const selectedProfile =
    visibleProfiles.find((profile) => profile.id === selectedProfileId) ??
    visibleProfiles[0] ??
    null;

  const assignmentValue =
    selectedProfile && (assignmentTargets[selectedProfile.id] ?? selectedProject?.id ?? "");
  const operationalProfilesCount = profiles.filter((profile) => !profile.isMissing).length;
  const assignedProfilesCount = profiles.filter((profile) => Boolean(profile.project)).length;

  return (
    <>
      <div className="grid gap-4">
        <Card>
          <CardHeader className="gap-5 border-b border-white/6 pb-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <CardTitle>Профили</CardTitle>
                <CardDescription>
                  Плотный реестр профилей с быстрым поиском, фильтрами и отдельной
                  операционной панелью для выбранного профиля.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                disabled={isHydrating || isMutating}
                className="h-10 xl:min-w-48"
                onClick={() => void syncProfilesAction()}
              >
                <RefreshCw className="size-4" />
                Подтянуть профили
              </Button>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_180px_180px_240px]">
              <div className="flex h-10 items-center rounded-2xl border border-white/8 bg-white/[0.035] pl-4 transition focus-within:border-primary/40 focus-within:bg-white/[0.05] focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={profileSearch}
                  onChange={(event) => setProfileSearch(event.target.value)}
                  className="h-full border-0 bg-transparent px-3 pr-4 shadow-none focus:border-0 focus:bg-transparent focus:ring-0"
                  placeholder="Поиск по профилю, ID, тегам или проекту"
                />
              </div>

              <Select
                value={profileStatusFilter}
                onChange={(event) => setProfileStatusFilter(event.target.value)}
              >
                {profileStatusFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </Select>

              <Select
                value={profileAssignmentFilter}
                onChange={(event) =>
                  setProfileAssignmentFilter(
                    event.target.value as "all" | "assigned" | "unassigned",
                  )
                }
              >
                {assignmentFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </Select>

              <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Текущий проект
                </p>
                <p className="mt-2 truncate text-sm font-semibold text-foreground">
                  {selectedProject?.name ?? "Не выбран"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <RegistryStat label="Видно" value={String(visibleProfiles.length)} />
              <RegistryStat label="Активных" value={String(operationalProfilesCount)} />
              <RegistryStat label="С проектом" value={String(assignedProfilesCount)} />
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-white/6 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Registry</CardTitle>
                  <CardDescription>
                    Компактный список для быстрого выбора профиля.
                  </CardDescription>
                </div>
                <Badge variant="neutral">{visibleProfiles.length}</Badge>
              </div>
            </CardHeader>

            <CardContent className="px-0 pb-0">
              {visibleProfiles.length > 0 ? (
                <>
                  <div className="hidden grid-cols-[minmax(0,2.3fr)_140px_150px_120px] gap-4 border-b border-white/6 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:grid">
                    <span>Профиль</span>
                    <span>Проект</span>
                    <span>Среда</span>
                    <span>Обновлен</span>
                  </div>

                  <div className="max-h-[calc(100vh-21rem)] overflow-y-auto">
                    {visibleProfiles.map((profile) => (
                      <ProfileRegistryRow
                        key={profile.id}
                        profile={profile}
                        selected={profile.id === selectedProfile?.id}
                        onSelect={() => setSelectedProfileId(profile.id)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                  По текущим фильтрам профили не найдены.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="xl:sticky xl:top-6">
            <CardHeader className="border-b border-white/6 pb-5">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Detail Panel
                  </p>
                  <CardTitle className="mt-2">
                    {selectedProfile?.name ?? "Профиль не выбран"}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {selectedProfile
                      ? selectedProfile.profileId
                      : "Выберите профиль слева, чтобы работать с действиями и привязкой."}
                  </CardDescription>
                </div>

                {selectedProfile ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getStatusTone(selectedProfile.status)}>
                      {prettifyStatus(selectedProfile.status)}
                    </Badge>
                    {selectedProfile.project ? (
                      <Badge variant="accent">{selectedProfile.project.name}</Badge>
                    ) : (
                      <Badge variant="neutral">Без проекта</Badge>
                    )}
                  </div>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 pt-5">
              {selectedProfile ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                    <Button
                      disabled={isMutating || selectedProfile.isMissing}
                      className="h-10"
                      onClick={() =>
                        void startProfileAction(selectedProfile.id, selectedProfile.name)
                      }
                    >
                      Старт
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isMutating || selectedProfile.isMissing}
                      className="h-10"
                      onClick={() =>
                        void stopProfileAction(selectedProfile.id, selectedProfile.name)
                      }
                    >
                      Стоп
                    </Button>
                  </div>

                  <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.02] p-4">
                    <p className="text-sm font-semibold text-foreground">Бизнес-действия</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Частые сценарии вынесены отдельно, без перегруза списка.
                    </p>
                    <div className="mt-4">
                      <BusinessActions
                        mode="compact"
                        disabled={isMutating || selectedProfile.isMissing}
                        onDisableAds={() =>
                          setDisableAdsTarget({
                            id: selectedProfile.id,
                            name: selectedProfile.name,
                          })
                        }
                        onLaunchAds={() =>
                          setLaunchAdsTarget({
                            id: selectedProfile.id,
                            name: selectedProfile.name,
                          })
                        }
                        onTopUpWallet={() =>
                          setTopUpTarget({
                            id: selectedProfile.id,
                            name: selectedProfile.name,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.02] p-4">
                    <p className="text-sm font-semibold text-foreground">Привязка к проекту</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Назначайте профиль в проект без перехода на другую страницу.
                    </p>

                    {selectedProfile.project ? (
                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-primary/14 bg-primary/8 px-4 py-3 text-sm text-foreground">
                          Профиль привязан к проекту {selectedProfile.project.name}.
                        </div>
                        <Button
                          variant="outline"
                          disabled={isMutating}
                          className="h-10"
                          onClick={() =>
                            void unassignProfileAction(
                              selectedProfile.id,
                              selectedProfile.name,
                            )
                          }
                        >
                          <Unlink2 className="size-4" />
                          Отвязать
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        <Select
                          value={assignmentValue ?? ""}
                          onChange={(event) =>
                            setAssignmentTargets((current) => ({
                              ...current,
                              [selectedProfile.id]: event.target.value,
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
                          className="h-10"
                          onClick={() =>
                            void assignProfileAction(
                              selectedProfile.id,
                              assignmentValue ?? "",
                              selectedProfile.name,
                            )
                          }
                        >
                          <Link2 className="size-4" />
                          Привязать к проекту
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.02] p-4">
                    <p className="text-sm font-semibold text-foreground">Технические детали</p>
                    <div className="mt-3">
                      <MetadataRow label="Папка" value={selectedProfile.folder ?? "—"} />
                      <MetadataRow label="Debug port" value={selectedProfile.debugPort ?? "—"} />
                      <MetadataRow
                        label="Последняя синхронизация"
                        value={formatDateTime(selectedProfile.lastSeenAt)}
                      />
                      <MetadataRow
                        label="Теги"
                        value={
                          selectedProfile.tags.length > 0
                            ? selectedProfile.tags.join(", ")
                            : "—"
                        }
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-muted-foreground">
                  В списке слева пока нет профилей для отображения.
                </div>
              )}
            </CardContent>
          </Card>
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

      <TopUpWalletDialog
        open={Boolean(launchAdsTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setLaunchAdsTarget(null);
          }
        }}
        isBusy={isMutating}
        scope="profile"
        targetLabel={launchAdsTarget?.name ?? ""}
        title="Запустить рекламу"
        description={
          launchAdsTarget
            ? `Укажите сумму в рублях для профиля «${launchAdsTarget.name}». Эта сумма будет использована для запуска рекламы.`
            : "Укажите сумму в рублях."
        }
        placeholder="Например, 1000"
        submitLabel="Создать задачу"
        onSubmit={async (amount) => {
          if (!launchAdsTarget) {
            return;
          }

          await launchAdsProfileAction(launchAdsTarget.id, launchAdsTarget.name, amount);
        }}
      />
    </>
  );
}
