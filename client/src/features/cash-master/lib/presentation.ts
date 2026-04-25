import type { Job, Profile, Project } from "@/shared/api/cash-master";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const toneByStatus: Record<string, BadgeTone> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
  AVAILABLE: "success",
  STARTED: "info",
  LOCKED: "danger",
  UNKNOWN: "neutral",
  MISSING: "danger",
  PENDING: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  PARTIALLY_FAILED: "warning",
  SKIPPED: "neutral",
};

export function prettifyStatus(value: string) {
  const labelByStatus: Record<string, string> = {
    ACTIVE: "Активен",
    PAUSED: "Пауза",
    ARCHIVED: "Архив",
    AVAILABLE: "Доступен",
    STARTED: "Запущен",
    LOCKED: "Заблокирован",
    UNKNOWN: "Неизвестно",
    MISSING: "Недоступен",
    PENDING: "В очереди",
    RUNNING: "В работе",
    COMPLETED: "Завершён",
    FAILED: "Ошибка",
    PARTIALLY_FAILED: "Частично с ошибками",
    SKIPPED: "Пропущен",
  };

  return labelByStatus[value] ?? value.toLowerCase().replaceAll("_", " ");
}

export function getStatusTone(value: string): BadgeTone {
  return toneByStatus[value] ?? "neutral";
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru-RU");
}

export function countAssignedProfiles(
  projectId: string,
  profiles: Profile[],
  fallback?: number,
) {
  if (typeof fallback === "number") {
    return fallback;
  }

  return profiles.filter((profile) => profile.project?.id === projectId).length;
}

export function totalJobItems(job: Job) {
  return job.items.length;
}

export function isProjectSelected(project: Project | null, selectedProjectId: string | null) {
  return Boolean(project && project.id === selectedProjectId);
}
