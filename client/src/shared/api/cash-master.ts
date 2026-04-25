"use client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

export type AuthUser = {
  id: string;
  email: string;
  role: "ADMIN";
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  notes: string;
  createdAt: string;
  updatedAt: string;
  profiles?: Profile[];
  jobs?: Job[];
  _count?: {
    profiles: number;
    jobs: number;
  };
};

export type Profile = {
  id: string;
  profileId: string;
  name: string;
  status: "AVAILABLE" | "STARTED" | "LOCKED" | "UNKNOWN" | "MISSING";
  folder: string | null;
  tags: string[];
  debugPort: string | null;
  websocketLink: string | null;
  lastSeenAt: string | null;
  isMissing: boolean;
  projectId?: string | null;
  project?: {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  } | null;
};

export type JobItem = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  profile: {
    id: string;
    profileId: string;
    name: string;
  };
};

export type Job = {
  id: string;
  type: "START_PROFILES" | "STOP_PROFILES";
  title: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIALLY_FAILED";
  summary: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
  triggeredByUser?: {
    id: string;
    email: string;
  } | null;
  items: JobItem[];
};

type RequestOptions = RequestInit & {
  bodyJson?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body:
      options.bodyJson !== undefined
        ? JSON.stringify(options.bodyJson)
        : options.body,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(", ")
          : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export async function getBootstrapStatus() {
  return request<{ needsBootstrap: boolean }>("/auth/bootstrap-status");
}

export async function bootstrapAdmin(email: string, password: string) {
  return request<{ user: AuthUser }>("/auth/bootstrap", {
    method: "POST",
    bodyJson: { email, password },
  });
}

export async function login(email: string, password: string) {
  return request<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    bodyJson: { email, password },
  });
}

export async function logout() {
  return request<{ success: boolean }>("/auth/logout", {
    method: "POST",
  });
}

export async function me() {
  return request<{ user: AuthUser }>("/auth/me");
}

export async function listProjects() {
  return request<Project[]>("/projects");
}

export async function getProject(projectId: string) {
  return request<Project>(`/projects/${projectId}`);
}

export async function createProject(payload: {
  name: string;
  description: string;
  status: "active" | "paused" | "archived";
  notes: string;
}) {
  return request<Project>("/projects", {
    method: "POST",
    bodyJson: payload,
  });
}

export async function updateProject(
  projectId: string,
  payload: Partial<{
    name: string;
    description: string;
    status: "active" | "paused" | "archived";
    notes: string;
  }>,
) {
  return request<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    bodyJson: payload,
  });
}

export async function listProfiles() {
  return request<Profile[]>("/profiles");
}

export async function syncProfiles() {
  return request<Profile[]>("/profiles/revision", {
    method: "POST",
  });
}

export async function assignProfile(profileRecordId: string, projectId: string) {
  return request<Profile>(`/profiles/${profileRecordId}/assign`, {
    method: "POST",
    bodyJson: { projectId },
  });
}

export async function unassignProfile(profileRecordId: string) {
  return request<Profile>(`/profiles/${profileRecordId}/unassign`, {
    method: "POST",
  });
}

export async function startProfile(profileRecordId: string) {
  return request<Job>(`/profiles/${profileRecordId}/start`, {
    method: "POST",
  });
}

export async function stopProfile(profileRecordId: string) {
  return request<Job>(`/profiles/${profileRecordId}/stop`, {
    method: "POST",
  });
}

export async function listJobs() {
  return request<Job[]>("/jobs");
}

export async function startProjectProfiles(projectId: string) {
  return request<Job>(`/jobs/projects/${projectId}/start`, {
    method: "POST",
  });
}

export async function stopProjectProfiles(projectId: string) {
  return request<Job>(`/jobs/projects/${projectId}/stop`, {
    method: "POST",
  });
}
