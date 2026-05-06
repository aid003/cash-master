"use client";

import {
  FolderPlus,
  Link2,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Search,
  Unlink2,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import {
  countAssignedProfiles,
  formatDateTime,
  getStatusTone,
  isProjectSelected,
  prettifyStatus,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { BusinessActions } from "@/features/cash-master/ui/business-actions";
import { TechnicalActionsMenu } from "@/features/cash-master/ui/technical-actions-menu";
import { TopUpWalletDialog } from "@/features/cash-master/ui/top-up-wallet-dialog";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

type ProjectFormState = {
  name: string;
  description: string;
  status: "active" | "paused" | "archived";
  notes: string;
};

const emptyProjectForm: ProjectFormState = {
  name: "",
  description: "",
  status: "active",
  notes: "",
};

function projectToForm(project: {
  name: string;
  description: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  notes: string;
}): ProjectFormState {
  return {
    name: project.name,
    description: project.description,
    status: project.status.toLowerCase() as "active" | "paused" | "archived",
    notes: project.notes,
  };
}

function ProjectFormFields({
  form,
  onChange,
}: {
  form: ProjectFormState;
  onChange: (next: ProjectFormState) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Название">
        <Input
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
        />
      </Field>
      <Field label="Описание">
        <Textarea
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          required
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <Field label="Статус">
          <Select
            value={form.status}
            onChange={(event) =>
              onChange({
                ...form,
                status: event.target.value as ProjectFormState["status"],
              })
            }
          >
            <option value="active">Активен</option>
            <option value="paused">Пауза</option>
            <option value="archived">Архив</option>
          </Select>
        </Field>
        <Field label="Заметки">
          <Input
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            placeholder="Короткая служебная заметка"
          />
        </Field>
      </div>
    </div>
  );
}

function ProjectDialog({
  title,
  description,
  form,
  open,
  submitLabel,
  isBusy,
  onChange,
  onOpenChange,
  onSubmit,
}: {
  title: string;
  description: string;
  form: ProjectFormState;
  open: boolean;
  submitLabel: string;
  isBusy: boolean;
  onChange: (next: ProjectFormState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <ProjectFormFields form={form} onChange={onChange} />
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={isBusy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const {
    assignProfileAction,
    createProjectAction,
    disableAdsSelectedProjectAction,
    isHydrating,
    isMutating,
    launchAdsSelectedProjectAction,
    profiles,
    projects,
    refreshAll,
    selectProject,
    selectedProject,
    startSelectedProjectProfilesAction,
    stopSelectedProjectProfilesAction,
    unassignProfileAction,
    updateSelectedProjectAction,
  } = useCashMasterData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isProfilesOpen, setIsProfilesOpen] = useState(false);
  const [isDisableAdsOpen, setIsDisableAdsOpen] = useState(false);
  const [isLaunchAdsOpen, setIsLaunchAdsOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyProjectForm);
  const [editForm, setEditForm] = useState(emptyProjectForm);
  const [availableProfilesSearch, setAvailableProfilesSearch] = useState("");
  const [profileToUnassign, setProfileToUnassign] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const deferredAvailableProfilesSearch = useDeferredValue(availableProfilesSearch);

  const selectedProjectProfiles = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    return profiles
      .filter((profile) => profile.project?.id === selectedProject.id)
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }, [profiles, selectedProject]);

  const actionableProjectProfiles = useMemo(
    () => selectedProjectProfiles.filter((profile) => !profile.isMissing),
    [selectedProjectProfiles],
  );

  const availableProfiles = useMemo(() => {
    const query = deferredAvailableProfilesSearch.trim().toLowerCase();
    const candidates = profiles
      .filter((profile) => !profile.project && !profile.isMissing)
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));

    if (!query) {
      return candidates.slice(0, 8);
    }

    return candidates.filter((profile) =>
      [profile.name, profile.profileId, profile.folder ?? "", profile.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [deferredAvailableProfilesSearch, profiles]);

  const projectActionDisabled = isMutating || actionableProjectProfiles.length === 0;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Card className="min-h-[calc(100vh-2rem)]">
          <CardHeader className="border-b border-white/6 pb-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Проекты</CardTitle>
                <CardDescription>
                  Список рабочих пространств и быстрый выбор активного проекта.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isHydrating || isMutating}
                  onClick={() => void refreshAll()}
                >
                  <RefreshCw className="size-4" />
                  Обновить
                </Button>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <FolderPlus className="size-4" />
                  Новый проект
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-2 pt-4">
            {projects.map((project) => {
              const isSelected = isProjectSelected(project, selectedProject?.id ?? null);
              const assignedProfiles = countAssignedProfiles(
                project.id,
                profiles,
                project._count?.profiles,
              );

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => selectProject(project.id)}
                  className={cn(
                    "grid gap-3 rounded-[1.35rem] border px-4 py-4 text-left transition",
                    isSelected
                      ? "border-white/12 bg-white/[0.07]"
                      : "border-white/6 bg-white/[0.02] hover:border-white/8 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {project.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {project.description}
                      </p>
                    </div>
                    <Badge variant={getStatusTone(project.status)}>
                      {prettifyStatus(project.status)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{assignedProfiles} профилей</span>
                    <span>{project._count?.jobs ?? 0} задач</span>
                    <span>Обновлен {formatDateTime(project.updatedAt)}</span>
                  </div>
                </button>
              );
            })}

            {projects.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-white/8 bg-white/[0.02] px-5 py-12 text-center text-sm text-muted-foreground">
                Проектов пока нет. Создайте первый проект через кнопку сверху.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="xl:sticky xl:top-5 xl:self-start">
          <Card>
            {selectedProject ? (
              <>
                <CardHeader className="border-b border-white/6 pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{selectedProject.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {selectedProject.description}
                      </CardDescription>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-foreground/72 transition hover:bg-white/[0.05] hover:text-foreground">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 p-1.5">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditForm(projectToForm(selectedProject));
                            setIsEditOpen(true);
                          }}
                        >
                          <PencilLine className="size-4" />
                          Редактировать проект
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsProfilesOpen(true)}>
                          <Link2 className="size-4" />
                          Управлять профилями
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isHydrating || isMutating}
                          onClick={() => void refreshAll()}
                        >
                          <RefreshCw className="size-4" />
                          Обновить данные
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-3 py-5">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <Badge variant={getStatusTone(selectedProject.status)}>
                      {prettifyStatus(selectedProject.status)}
                    </Badge>
                    <span>{selectedProjectProfiles.length} профилей</span>
                    <span>{actionableProjectProfiles.length} доступны</span>
                  </div>
                  <BusinessActions
                    showTopUpWallet={false}
                    disabled={projectActionDisabled}
                    onDisableAds={() => setIsDisableAdsOpen(true)}
                    onLaunchAds={() => setIsLaunchAdsOpen(true)}
                    onTopUpWallet={() => undefined}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-12 text-[0.95rem]"
                      onClick={() => setIsProfilesOpen(true)}
                    >
                      Профили
                    </Button>
                    <TechnicalActionsMenu
                      disabled={projectActionDisabled}
                      onStart={() => void startSelectedProjectProfilesAction()}
                      onStop={() => void stopSelectedProjectProfilesAction()}
                    />
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <p>{selectedProject.notes ? selectedProject.notes : "Пока без заметок."}</p>
                    <p>
                      {actionableProjectProfiles.length > 0
                        ? `К действиям готовы ${actionableProjectProfiles.length} профилей`
                        : "Нет доступных профилей для действий"}
                    </p>
                    <p>Создан: {formatDateTime(selectedProject.createdAt)}</p>
                    <p>Обновлен: {formatDateTime(selectedProject.updatedAt)}</p>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex min-h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
                Выберите проект слева, чтобы открыть сводку и действия.
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <ProjectDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreateForm(emptyProjectForm);
          }
        }}
        title="Новый проект"
        description="Создайте рабочее пространство, в котором будут собраны профили и массовые действия."
        form={createForm}
        onChange={setCreateForm}
        isBusy={isMutating}
        submitLabel="Создать проект"
        onSubmit={async () => {
          await createProjectAction(createForm);
          setCreateForm(emptyProjectForm);
          setIsCreateOpen(false);
        }}
      />

      <ProjectDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Редактирование проекта"
        description="Обновите название, статус и заметки без выхода из рабочей панели."
        form={editForm}
        onChange={setEditForm}
        isBusy={isMutating || !selectedProject}
        submitLabel="Сохранить"
        onSubmit={async () => {
          await updateSelectedProjectAction(editForm);
          setIsEditOpen(false);
        }}
      />

      <TopUpWalletDialog
        open={isDisableAdsOpen}
        onOpenChange={setIsDisableAdsOpen}
        isBusy={isMutating}
        scope="project"
        targetLabel={selectedProject?.name ?? ""}
        title="Отключить рекламу"
        description={
          selectedProject
            ? `Укажите сумму в рублях для проекта «${selectedProject.name}». Эта сумма будет применена к каждому доступному профилю проекта.`
            : "Укажите сумму в рублях."
        }
        placeholder="Например, 1000"
        submitLabel="Создать задачу"
        onSubmit={async (amount) => {
          await disableAdsSelectedProjectAction(amount);
        }}
      />

      <TopUpWalletDialog
        open={isLaunchAdsOpen}
        onOpenChange={setIsLaunchAdsOpen}
        isBusy={isMutating}
        scope="project"
        targetLabel={selectedProject?.name ?? ""}
        title="Запустить рекламу"
        description={
          selectedProject
            ? `Укажите сумму в рублях для проекта «${selectedProject.name}». Эта сумма будет применена к каждому доступному профилю проекта для запуска рекламы.`
            : "Укажите сумму в рублях."
        }
        placeholder="Например, 1000"
        submitLabel="Создать задачу"
        onSubmit={async (amount) => {
          await launchAdsSelectedProjectAction(amount);
        }}
      />

      <Dialog open={isProfilesOpen} onOpenChange={setIsProfilesOpen}>
        <DialogContent className="max-h-[calc(100vh-4rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Профили проекта {selectedProject ? `«${selectedProject.name}»` : ""}
            </DialogTitle>
            <DialogDescription>
              Управляйте составом проекта отдельно от action center, чтобы не терять фокус на рабочих операциях.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Привязанные
                </p>
                <Badge variant="neutral">{selectedProjectProfiles.length}</Badge>
              </div>

              {selectedProjectProfiles.length > 0 ? (
                <ScrollArea className="max-h-72 pr-2">
                  <div className="grid gap-2">
                    {selectedProjectProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {profile.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate font-mono">{profile.profileId}</span>
                            <span>•</span>
                            <span>{prettifyStatus(profile.status)}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={isMutating}
                          onClick={() =>
                            setProfileToUnassign({
                              id: profile.id,
                              name: profile.name,
                            })
                          }
                          aria-label={`Отвязать профиль ${profile.name}`}
                        >
                          <Unlink2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-muted-foreground">
                  В этом проекте пока нет привязанных профилей.
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Добавить профиль
              </p>
              <div className="flex h-10 items-center rounded-2xl border border-white/8 bg-white/[0.035] pl-4 transition focus-within:border-primary/40 focus-within:bg-white/[0.05] focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
                <input
                  value={availableProfilesSearch}
                  onChange={(event) => setAvailableProfilesSearch(event.target.value)}
                  className="h-full w-full bg-transparent px-3 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                  placeholder="Поиск свободных профилей"
                />
              </div>

              {availableProfiles.length > 0 ? (
                <ScrollArea className="max-h-80 pr-2">
                  <div className="grid gap-2">
                    {availableProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {profile.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate font-mono">{profile.profileId}</span>
                            <span>•</span>
                            <span>{prettifyStatus(profile.status)}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isMutating || !selectedProject}
                          onClick={() =>
                            selectedProject
                              ? void assignProfileAction(
                                  profile.id,
                                  selectedProject.id,
                                  profile.name,
                                )
                              : undefined
                          }
                        >
                          <Link2 className="size-4" />
                          Добавить
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-muted-foreground">
                  {deferredAvailableProfilesSearch.trim()
                    ? "По вашему запросу свободные профили не найдены."
                    : "Свободных профилей для привязки сейчас нет."}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(profileToUnassign)}
        onOpenChange={(open) => {
          if (!open) {
            setProfileToUnassign(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отвязать профиль?</DialogTitle>
            <DialogDescription>
              {profileToUnassign && selectedProject
                ? `Профиль ${profileToUnassign.name} будет удален из проекта ${selectedProject.name}.`
                : "Подтвердите отвязку профиля от проекта."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProfileToUnassign(null)}
              disabled={isMutating}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isMutating || !profileToUnassign}
              onClick={async () => {
                if (!profileToUnassign) {
                  return;
                }

                await unassignProfileAction(profileToUnassign.id, profileToUnassign.name);
                setProfileToUnassign(null);
              }}
            >
              Отвязать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
