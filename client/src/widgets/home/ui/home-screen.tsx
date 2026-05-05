"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  CirclePlay,
  CircleStop,
  FolderSync,
  LogOut,
  Rocket,
  Settings2,
  Shield,
  X,
} from "lucide-react";

import {
  assignProfile,
  createProject,
  getUndetectableConnectionSettings,
  getProject,
  listJobs,
  listProfiles,
  listProjects,
  login,
  logout,
  me,
  saveUndetectableConnectionSettings,
  signup,
  startProfile,
  startProjectProfiles,
  stopProfile,
  stopProjectProfiles,
  syncProfiles,
  testUndetectableConnectionSettings,
  unassignProfile,
  updateProject,
  type AuthUser,
  type Job,
  type Profile,
  type Project,
  type UndetectableConnectionSettings,
  type UndetectableConnectionTestResult,
} from "@/shared/api/cash-master";
import { Button } from "@/shared/ui/button";

type AuthMode = "login" | "register";

const projectStatuses = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
] as const;

const toneByStatus: Record<string, string> = {
  ACTIVE: "bg-emerald-500/12 text-emerald-700",
  PAUSED: "bg-amber-500/12 text-amber-700",
  ARCHIVED: "bg-slate-500/12 text-slate-700",
  AVAILABLE: "bg-emerald-500/12 text-emerald-700",
  STARTED: "bg-sky-500/12 text-sky-700",
  LOCKED: "bg-rose-500/12 text-rose-700",
  UNKNOWN: "bg-slate-500/12 text-slate-700",
  MISSING: "bg-rose-500/12 text-rose-700",
  PENDING: "bg-slate-500/12 text-slate-700",
  RUNNING: "bg-sky-500/12 text-sky-700",
  COMPLETED: "bg-emerald-500/12 text-emerald-700",
  FAILED: "bg-rose-500/12 text-rose-700",
  PARTIALLY_FAILED: "bg-amber-500/12 text-amber-700",
  SKIPPED: "bg-zinc-500/12 text-zinc-700",
};

function prettifyStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

const UNDETECTABLE_SETTINGS_DRAFT_KEY = "cash-master:undetectable-settings-draft";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-foreground/80">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-11 rounded-2xl border border-border/70 bg-white/80 px-4 text-sm outline-none transition focus:border-primary"
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-28 rounded-2xl border border-border/70 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-primary"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-11 rounded-2xl border border-border/70 bg-white/80 px-4 text-sm outline-none transition focus:border-primary"
    />
  );
}

export function HomeScreen() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connectionSettings, setConnectionSettings] =
    useState<UndetectableConnectionSettings | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>(
    {},
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    protocol: "http" as "http" | "https",
    host: "127.0.0.1",
    port: "25325",
  });
  const [settingsTestResult, setSettingsTestResult] =
    useState<UndetectableConnectionTestResult | null>(null);

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "paused" | "archived",
    notes: "",
  });

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;

  function persistSettingsDraft(next: {
    protocol: "http" | "https";
    host: string;
    port: string;
  }) {
    setSettingsForm(next);
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(UNDETECTABLE_SETTINGS_DRAFT_KEY, JSON.stringify(next));
  }

  function composeConnectionForm(
    settings: UndetectableConnectionSettings,
  ): { protocol: "http" | "https"; host: string; port: string } {
    let draft: Partial<{ protocol: "http" | "https"; host: string; port: string }> = {};

    if (typeof window !== "undefined") {
      const rawDraft = window.localStorage.getItem(UNDETECTABLE_SETTINGS_DRAFT_KEY);
      if (rawDraft) {
        try {
          draft = JSON.parse(rawDraft) as Partial<{ host: string; port: string }>;
        } catch {
          window.localStorage.removeItem(UNDETECTABLE_SETTINGS_DRAFT_KEY);
        }
      }
    }

    return {
      protocol: draft.protocol === "https" ? "https" : settings.protocol,
      host: typeof draft.host === "string" && draft.host.trim() ? draft.host : settings.host,
      port:
        typeof draft.port === "string" && draft.port.trim()
          ? draft.port
          : String(settings.port),
    };
  }

  function fillProjectForm(project: Project | null) {
    if (!project) {
      setProjectForm({
        name: "",
        description: "",
        status: "active",
        notes: "",
      });
      return;
    }

    setProjectForm({
      name: project.name,
      description: project.description,
      status: project.status.toLowerCase() as "active" | "paused" | "archived",
      notes: project.notes,
    });
  }

  function selectProject(project: Project | null) {
    setSelectedProjectId(project?.id ?? null);
    fillProjectForm(project);
  }

  async function hydrate() {
    const [projectsData, profilesData, jobsData, connectionSettingsData] = await Promise.all([
      listProjects(),
      listProfiles(),
      listJobs(),
      getUndetectableConnectionSettings(),
    ]);
    setProjects(projectsData);
    setProfiles(profilesData);
    setJobs(jobsData);
    setConnectionSettings(connectionSettingsData);
    const nextSelectedProject =
      projectsData.find((project) => project.id === selectedProjectId) ??
      projectsData[0] ??
      null;
    selectProject(nextSelectedProject);
  }

  useEffect(() => {
    async function boot() {
      try {
        const currentUser = await me().catch(() => null);

        if (currentUser) {
          setUser(currentUser.user);
          const [projectsData, profilesData, jobsData, connectionSettingsData] =
            await Promise.all([
              listProjects(),
              listProfiles(),
              listJobs(),
              getUndetectableConnectionSettings(),
            ]);
          setProjects(projectsData);
          setProfiles(profilesData);
          setJobs(jobsData);
          setConnectionSettings(connectionSettingsData);
          const nextSelectedProject = projectsData[0] ?? null;
          setSelectedProjectId(nextSelectedProject?.id ?? null);
          fillProjectForm(nextSelectedProject);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Initial load failed");
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, []);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const result =
        authMode === "register"
          ? await signup(email, password)
          : await login(email, password);
      setUser(result.user);
      setAuthMode("login");
      setPassword("");
      await hydrate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    try {
      await logout();
      setUser(null);
      setProjects([]);
      setProfiles([]);
      setJobs([]);
      setConnectionSettings(null);
      setSelectedProjectId(null);
      setMessage(null);
      setAuthMode("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function openConnectionSettings() {
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsMessage(null);
    setSettingsTestResult(null);

    try {
      const settings = await getUndetectableConnectionSettings();
      setConnectionSettings(settings);
      setSettingsForm(composeConnectionForm(settings));
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Failed to load connection settings",
      );
    } finally {
      setSettingsLoading(false);
    }
  }

  function closeConnectionSettings() {
    setSettingsOpen(false);
    setSettingsLoading(false);
    setSettingsSubmitting(false);
    setSettingsMessage(null);
    setSettingsTestResult(null);
  }

  async function handleTestConnection() {
    setSettingsSubmitting(true);
    setSettingsMessage(null);
    setSettingsTestResult(null);

    try {
      const result = await testUndetectableConnectionSettings({
        protocol: settingsForm.protocol,
        host: settingsForm.host.trim(),
        port: Number(settingsForm.port),
      });
      setSettingsTestResult(result);
      setSettingsMessage(
        `Connected to ${result.baseUrl}, ${result.profileCount} profiles available.`,
      );
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Connection test failed",
      );
    } finally {
      setSettingsSubmitting(false);
    }
  }

  async function handleSaveConnection() {
    setSettingsSubmitting(true);
    setSettingsMessage(null);
    setSettingsTestResult(null);

    try {
      const saved = await saveUndetectableConnectionSettings({
        protocol: settingsForm.protocol,
        host: settingsForm.host.trim(),
        port: Number(settingsForm.port),
      });
      setConnectionSettings(saved);
      setSettingsMessage(
        `Connected to ${saved.baseUrl}, ${saved.lastProfileCount ?? 0} profiles available.`,
      );
      await hydrate();
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Failed to save connection settings",
      );
    } finally {
      setSettingsSubmitting(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setSubmitting(true);
    setMessage(null);
    try {
      await action();
      await hydrate();
      if (selectedProjectId) {
        const freshProject = await getProject(selectedProjectId).catch(() => null);
        if (freshProject) {
          setProjects((current) =>
            current.map((project) =>
              project.id === freshProject.id ? freshProject : project,
            ),
          );
          fillProjectForm(freshProject);
        }
      }
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="rounded-3xl border border-border/70 bg-white/80 px-6 py-5 text-sm text-muted-foreground shadow-xl">
          Loading Cash Master...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(26,86,219,0.2),_transparent_36%),radial-gradient(circle_at_85%_15%,_rgba(16,185,129,0.18),_transparent_24%),linear-gradient(180deg,_#f8fafc,_#eef2ff)]" />
        <section className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
          <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/75 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <Shield className="size-4 text-primary" />
                Cash Master Control Room
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
                Проекты, профили Undetectable и пакетные действия в одной панели.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Панель под локальную связку Next.js, NestJS, Prisma и Redis:
                ревизия профилей, привязка к проектам, ручной старт/стоп и история
                задач.
              </p>
            </div>

            <form
              onSubmit={handleAuthSubmit}
              className="rounded-[2rem] border border-border/70 bg-white/88 p-8 shadow-[0_36px_120px_-48px_rgba(15,23,42,0.5)] backdrop-blur"
            >
              <div className="mb-6 space-y-2">
                <p className="text-sm uppercase tracking-[0.25em] text-primary">
                  {authMode === "register" ? "Admin Register" : "Admin Login"}
                </p>
                <h2 className="text-3xl font-semibold text-foreground">
                  {authMode === "register"
                    ? "Создайте аккаунт администратора"
                    : "Войдите в панель управления"}
                </h2>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={authMode === "login" ? "secondary" : "ghost"}
                  onClick={() => {
                    setMessage(null);
                    setPassword("");
                    setAuthMode("login");
                  }}
                >
                  Login
                </Button>
                <Button
                  type="button"
                  variant={authMode === "register" ? "secondary" : "ghost"}
                  onClick={() => {
                    setMessage(null);
                    setPassword("");
                    setAuthMode("register");
                  }}
                >
                  Register
                </Button>
              </div>

              <div className="grid gap-4">
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Password">
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 h-12 rounded-2xl text-sm font-semibold"
                  disabled={submitting}
                >
                  {submitting
                    ? "Processing..."
                    : authMode === "register"
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </div>

              {message ? (
                <p className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                  {message}
                </p>
              ) : null}
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(26,86,219,0.14),_transparent_30%),radial-gradient(circle_at_85%_15%,_rgba(16,185,129,0.14),_transparent_22%),linear-gradient(180deg,_#f8fafc,_#edf2f7)]" />
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="rounded-[2rem] border border-border/70 bg-white/86 p-6 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.5)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-primary">
                Local Operations Desk
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                Cash Master Admin
              </h1>
              <p className="text-sm text-muted-foreground">
                {user.email} · общий админ-контур для проектов, профилей и задач.
              </p>
              {connectionSettings ? (
                <p className="text-sm text-muted-foreground">
                  Undetectable API: {connectionSettings.baseUrl} · source:{" "}
                  {connectionSettings.source}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-2xl"
                disabled={submitting}
                onClick={() => void openConnectionSettings()}
              >
                <Settings2 className="size-4" />
                Настройки Undetectable
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-2xl"
                disabled={submitting}
                onClick={() =>
                  void runAction(() => syncProfiles(), "Profile revision completed")
                }
              >
                <FolderSync className="size-4" />
                Ревизия профилей
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11 rounded-2xl"
                disabled={submitting}
                onClick={() => void runAction(() => hydrate(), "Data refreshed")}
              >
                <Rocket className="size-4" />
                Обновить данные
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="h-11 rounded-2xl"
                disabled={submitting}
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" />
                Выйти
              </Button>
            </div>
          </div>

          {message ? (
            <p className="mt-5 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
              {message}
            </p>
          ) : null}
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-6">
            <div className="rounded-[2rem] border border-border/70 bg-white/86 p-6 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.5)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">
                    Projects
                  </p>
                  <h2 className="text-2xl font-semibold">Создание и выбор проекта</h2>
                </div>
                <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                  {projects.length} total
                </div>
              </div>

              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () =>
                      createProject({
                        ...projectForm,
                      }),
                    "Project created",
                  );
                }}
              >
                <Field label="Название">
                  <TextInput
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                <Field label="Описание">
                  <TextArea
                    value={projectForm.description}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                <Field label="Статус">
                  <Select
                    value={projectForm.status}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        status: event.target.value as "active" | "paused" | "archived",
                      }))
                    }
                  >
                    {projectStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Заметки">
                  <TextArea
                    value={projectForm.notes}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 rounded-2xl"
                  disabled={submitting}
                >
                  Создать проект
                </Button>
              </form>

              <div className="mt-6 grid gap-3">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => selectProject(project)}
                    className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                      project.id === selectedProjectId
                        ? "border-primary bg-primary/8"
                        : "border-border/70 bg-white/70 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {project.name}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {project.description}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                          toneByStatus[project.status]
                        }`}
                      >
                        {prettifyStatus(project.status)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{project._count?.profiles ?? 0} profiles</span>
                      <span>{project._count?.jobs ?? 0} jobs</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-border/70 bg-white/86 p-6 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.5)]">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-[0.25em] text-primary">
                  Jobs
                </p>
                <h2 className="text-2xl font-semibold">История операций</h2>
              </div>

              <div className="grid gap-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-[1.5rem] border border-border/70 bg-white/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground">{job.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {job.project?.name ?? "Without project"} ·{" "}
                          {new Date(job.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                          toneByStatus[job.status]
                        }`}
                      >
                        {prettifyStatus(job.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {job.summary ?? "Task queued"}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {job.items.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-2xl bg-secondary/70 px-3 py-2 text-sm"
                        >
                          <span>{item.profile.name}</span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                              toneByStatus[item.status]
                            }`}
                          >
                            {prettifyStatus(item.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2rem] border border-border/70 bg-white/86 p-6 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.5)]">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">
                    Project Detail
                  </p>
                  <h2 className="text-2xl font-semibold">
                    {selectedProject?.name ?? "Выберите проект"}
                  </h2>
                </div>

                {selectedProject ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="lg"
                      className="h-11 rounded-2xl"
                      disabled={submitting}
                      onClick={() =>
                        void runAction(
                          () => startProjectProfiles(selectedProject.id),
                          "Bulk start job created",
                        )
                      }
                    >
                      <CirclePlay className="size-4" />
                      Старт проекта
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-11 rounded-2xl"
                      disabled={submitting}
                      onClick={() =>
                        void runAction(
                          () => stopProjectProfiles(selectedProject.id),
                          "Bulk stop job created",
                        )
                      }
                    >
                      <CircleStop className="size-4" />
                      Стоп проекта
                    </Button>
                  </div>
                ) : null}
              </div>

              {selectedProject ? (
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction(
                      () => updateProject(selectedProject.id, projectForm),
                      "Project updated",
                    );
                  }}
                >
                  <Field label="Название">
                    <TextInput
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Описание">
                    <TextArea
                      value={projectForm.description}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Статус">
                    <Select
                      value={projectForm.status}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          status: event.target.value as
                            | "active"
                            | "paused"
                            | "archived",
                        }))
                      }
                    >
                      {projectStatuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Заметки">
                    <TextArea
                      value={projectForm.notes}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="outline"
                    size="lg"
                    className="h-11 rounded-2xl"
                    disabled={submitting}
                  >
                    Сохранить проект
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Сначала создайте или выберите проект слева.
                </p>
              )}
            </div>

            <div className="rounded-[2rem] border border-border/70 bg-white/86 p-6 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.5)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">
                    Profiles Registry
                  </p>
                  <h2 className="text-2xl font-semibold">Профили Undetectable</h2>
                </div>
                <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                  {profiles.length} total
                </div>
              </div>

              <div className="grid gap-4">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-[1.5rem] border border-border/70 bg-white/70 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">
                            {profile.name}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${
                              toneByStatus[profile.status]
                            }`}
                          >
                            {prettifyStatus(profile.status)}
                          </span>
                          {profile.project ? (
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase text-primary">
                              {profile.project.name}
                            </span>
                          ) : null}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {profile.profileId}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Folder: {profile.folder ?? "—"}</span>
                          <span>Debug: {profile.debugPort ?? "—"}</span>
                          <span>
                            Tags: {profile.tags.length > 0 ? profile.tags.join(", ") : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 xl:min-w-72">
                        {profile.project ? (
                          <Button
                            variant="outline"
                            className="h-10 rounded-2xl"
                            disabled={submitting}
                            onClick={() =>
                              void runAction(
                                () => unassignProfile(profile.id),
                                `Profile ${profile.name} unassigned`,
                              )
                            }
                          >
                            Отвязать от проекта
                          </Button>
                        ) : (
                          <>
                            <Select
                              value={assignmentTargets[profile.id] ?? selectedProjectId ?? ""}
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
                              className="h-10 rounded-2xl"
                              disabled={
                                submitting ||
                                !(assignmentTargets[profile.id] ?? selectedProjectId)
                              }
                              onClick={() =>
                                void runAction(
                                  () =>
                                    assignProfile(
                                      profile.id,
                                      assignmentTargets[profile.id] ?? selectedProjectId ?? "",
                                    ),
                                  `Profile ${profile.name} assigned`,
                                )
                              }
                            >
                              Привязать к проекту
                            </Button>
                          </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            className="h-10 rounded-2xl"
                            disabled={submitting || profile.isMissing}
                            onClick={() =>
                              void runAction(
                                () => startProfile(profile.id),
                                `Start job created for ${profile.name}`,
                              )
                            }
                          >
                            Старт
                          </Button>
                          <Button
                            variant="outline"
                            className="h-10 rounded-2xl"
                            disabled={submitting || profile.isMissing}
                            onClick={() =>
                              void runAction(
                                () => stopProfile(profile.id),
                                `Stop job created for ${profile.name}`,
                              )
                            }
                          >
                            Стоп
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-border/70 bg-white p-6 shadow-[0_36px_120px_-48px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.25em] text-primary">
                  Connection Settings
                </p>
                <h2 className="text-2xl font-semibold text-foreground">
                  Undetectable API endpoint
                </h2>
                <p className="text-sm text-muted-foreground">
                  Задайте активный `host + port` для backend и фоновых jobs.
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="rounded-2xl"
                onClick={() => closeConnectionSettings()}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[140px_1fr_180px]">
              <Field label="Protocol">
                <select
                  value={settingsForm.protocol}
                  onChange={(event) =>
                    persistSettingsDraft({
                      ...settingsForm,
                      protocol: event.target.value as "http" | "https",
                    })
                  }
                  disabled={settingsLoading || settingsSubmitting}
                  className="flex h-11 w-full rounded-[1.25rem] border border-border/70 bg-white px-4 text-sm uppercase text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
              </Field>
              <Field label="Host">
                <TextInput
                  value={settingsForm.host}
                  onChange={(event) =>
                    persistSettingsDraft({
                      ...settingsForm,
                      host: event.target.value,
                    })
                  }
                  placeholder="127.0.0.1"
                  disabled={settingsLoading || settingsSubmitting}
                />
              </Field>
              <Field label="Port">
                <TextInput
                  inputMode="numeric"
                  value={settingsForm.port}
                  onChange={(event) =>
                    persistSettingsDraft({
                      ...settingsForm,
                      port: event.target.value,
                    })
                  }
                  placeholder="25325"
                  disabled={settingsLoading || settingsSubmitting}
                />
              </Field>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-secondary/60 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Cable className="size-4 text-primary" />
                <span className="font-medium">
                  Active endpoint: {connectionSettings?.baseUrl ?? "—"}
                </span>
              </div>
              <p className="mt-2">
                Источник: {connectionSettings?.source ?? "—"} · Последняя проверка:{" "}
                {connectionSettings?.lastCheckedAt
                  ? new Date(connectionSettings.lastCheckedAt).toLocaleString("ru-RU")
                  : "—"}
              </p>
              <p className="mt-2">
                Последний статус:{" "}
                {connectionSettings?.lastCheckOk === null
                  ? "not checked"
                  : connectionSettings?.lastCheckOk
                    ? `reachable${typeof connectionSettings?.lastProfileCount === "number" ? `, ${connectionSettings.lastProfileCount} profiles` : ""}`
                    : connectionSettings?.lastCheckError ?? "unreachable"}
              </p>
              {settingsTestResult ? (
                <p className="mt-2 text-emerald-700">
                  Проверка: reachable, {settingsTestResult.profileCount} profiles found.
                </p>
              ) : null}
            </div>

            {settingsMessage ? (
              <p className="mt-5 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
                {settingsMessage}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                className="h-11 rounded-2xl"
                disabled={settingsLoading || settingsSubmitting}
                onClick={() => void handleTestConnection()}
              >
                Проверить
              </Button>
              <Button
                className="h-11 rounded-2xl"
                disabled={settingsLoading || settingsSubmitting}
                onClick={() => void handleSaveConnection()}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
