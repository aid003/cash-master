"use client";

import {
  CirclePlay,
  CircleStop,
  FolderPlus,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Rocket,
} from "lucide-react";
import { useState } from "react";

import {
  countAssignedProfiles,
  formatDateTime,
  getStatusTone,
  isProjectSelected,
  prettifyStatus,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
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
import { Separator } from "@/shared/ui/separator";
import { Textarea } from "@/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

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
      <div className="grid grid-cols-[180px_1fr] gap-4">
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

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="bg-white/[0.03]">
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  const {
    createProjectAction,
    isHydrating,
    isMutating,
    profiles,
    projects,
    refreshAll,
    selectProject,
    selectedProject,
    startSelectedProjectProfilesAction,
    stopSelectedProjectProfilesAction,
    updateSelectedProjectAction,
  } = useCashMasterData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyProjectForm);
  const [editForm, setEditForm] = useState(emptyProjectForm);

  const assignedProfilesCount = profiles.filter((profile) => profile.project).length;

  return (
    <>
      <div className="grid gap-4">
        <section className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Проекты"
            value={projects.length}
            hint="Всего в рабочем столе"
          />
          <MetricCard
            label="Профили"
            value={assignedProfilesCount}
            hint="Уже распределены по проектам"
          />
          <MetricCard
            label="Выбран"
            value={selectedProject?.name ?? "Не выбран"}
            hint="Текущий активный контекст"
          />
          <Card className="bg-white/[0.03]">
            <CardContent className="flex h-full items-center justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Действия
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Обновление данных и создание проекта
                </p>
              </div>
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isHydrating || isMutating}
                        onClick={() => void refreshAll()}
                        aria-label="Обновить данные"
                      />
                    }
                  >
                    <RefreshCw className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Обновить данные</TooltipContent>
                </Tooltip>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <FolderPlus className="size-4" />
                  Новый проект
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
          <Card className="min-h-[calc(100vh-244px)]">
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Список проектов</CardTitle>
                <CardDescription>
                  Выберите проект, чтобы увидеть детали и быстрые действия.
                </CardDescription>
              </div>
              <Badge variant="neutral">{projects.length} всего</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[calc(100vh-340px)] pr-2">
                <div className="grid gap-3">
                  {projects.map((project) => {
                    const isSelected = isProjectSelected(project, selectedProject?.id ?? null);

                    return (
                      <div
                        key={project.id}
                        className={cn(
                          "grid gap-3 rounded-[1.4rem] border px-4 py-4 transition",
                          isSelected
                            ? "border-white/10 bg-white/[0.06]"
                            : "border-white/6 bg-white/[0.025] hover:border-white/8 hover:bg-white/[0.04]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => selectProject(project.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-base font-semibold text-foreground">
                              {project.name}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {project.description}
                            </p>
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="rounded-full border border-white/8 bg-white/[0.035] p-2 text-foreground/72 transition hover:bg-white/[0.06] hover:text-foreground">
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() => {
                                  selectProject(project.id);
                                  setEditForm(projectToForm(project));
                                  setIsEditOpen(true);
                                }}
                              >
                                <PencilLine className="size-4" />
                                Редактировать
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  selectProject(project.id);
                                  setIsEditOpen(false);
                                }}
                              >
                                <Rocket className="size-4" />
                                Открыть
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={getStatusTone(project.status)}>
                            {prettifyStatus(project.status)}
                          </Badge>
                          <Badge variant="neutral">
                            {countAssignedProfiles(project.id, profiles, project._count?.profiles)} профилей
                          </Badge>
                          <Badge variant="neutral">{project._count?.jobs ?? 0} задач</Badge>
                        </div>

                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Создан {formatDateTime(project.createdAt)}</span>
                          <span>Обновлён {formatDateTime(project.updatedAt)}</span>
                        </div>
                      </div>
                    );
                  })}

                  {projects.length === 0 ? (
                    <div className="rounded-[1.4rem] border border-dashed border-white/8 bg-white/[0.02] px-5 py-12 text-center text-sm text-muted-foreground">
                      Проектов пока нет. Создайте первый проект через кнопку сверху.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="bg-white/[0.03]">
            {selectedProject ? (
              <>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{selectedProject.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {selectedProject.description}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusTone(selectedProject.status)}>
                      {prettifyStatus(selectedProject.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Button disabled={isMutating} onClick={() => void startSelectedProjectProfilesAction()}>
                      <CirclePlay className="size-4" />
                      Старт
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isMutating}
                      onClick={() => void stopSelectedProjectProfilesAction()}
                    >
                      <CircleStop className="size-4" />
                      Стоп
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditForm(projectToForm(selectedProject));
                        setIsEditOpen(true);
                      }}
                    >
                      <PencilLine className="size-4" />
                      Редактировать
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isHydrating || isMutating}
                      onClick={() => void refreshAll()}
                    >
                      <Rocket className="size-4" />
                      Обновить
                    </Button>
                  </div>

                  <Separator />

                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="bg-white/[0.03] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Профили
                        </p>
                        <p className="mt-2 text-xl font-semibold text-foreground">
                          {countAssignedProfiles(
                            selectedProject.id,
                            profiles,
                            selectedProject._count?.profiles,
                          )}
                        </p>
                      </Card>
                      <Card className="bg-white/[0.03] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Задачи
                        </p>
                        <p className="mt-2 text-xl font-semibold text-foreground">
                          {selectedProject._count?.jobs ?? 0}
                        </p>
                      </Card>
                    </div>

                    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Заметки
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground/84">
                        {selectedProject.notes || "Пока без заметок."}
                      </p>
                    </div>

                    <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-4 text-sm text-muted-foreground">
                      <p>Создан: {formatDateTime(selectedProject.createdAt)}</p>
                      <p className="mt-2">Обновлён: {formatDateTime(selectedProject.updatedAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex h-full min-h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
                Выберите проект слева, чтобы открыть сводку и действия.
              </CardContent>
            )}
          </Card>
        </section>
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
        description="Минимальная форма создания без постоянной боковой панели."
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
        description="Обновление названия, статуса и кратких заметок."
        form={editForm}
        onChange={setEditForm}
        isBusy={isMutating || !selectedProject}
        submitLabel="Сохранить"
        onSubmit={async () => {
          await updateSelectedProjectAction(editForm);
          setIsEditOpen(false);
        }}
      />
    </>
  );
}
