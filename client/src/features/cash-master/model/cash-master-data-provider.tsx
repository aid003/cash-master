"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  assignProfile,
  createProject,
  disableAdsProfile,
  disableAdsProjectProfiles,
  getProject,
  getUndetectableConnectionSettings,
  launchAdsProfile,
  launchAdsProjectProfiles,
  listJobs,
  listProfiles,
  listProjects,
  saveUndetectableConnectionSettings,
  startProfile,
  startProjectProfiles,
  stopProfile,
  stopProjectProfiles,
  syncProfiles,
  testUndetectableConnectionSettings,
  topUpWalletProfile,
  topUpWalletProjectProfiles,
  unassignProfile,
  updateProject,
  type Job,
  type Profile,
  type Project,
  type UndetectableConnectionSettings,
  type UndetectableConnectionTestResult,
} from "@/shared/api/cash-master";
import { runToastAction } from "@/shared/lib/notifications";
import { useAppUiStore } from "@/shared/store/app-ui-store";

type CashMasterDataContextValue = {
  connectionSettings: UndetectableConnectionSettings | null;
  isHydrating: boolean;
  isMutating: boolean;
  jobs: Job[];
  profiles: Profile[];
  projects: Project[];
  selectedProject: Project | null;
  createProjectAction: (payload: {
    name: string;
    description: string;
    status: "active" | "paused" | "archived";
    notes: string;
  }) => Promise<void>;
  refreshAll: () => Promise<void>;
  saveConnectionSettingsAction: (payload: {
    protocol: "http" | "https";
    host: string;
    port: number;
  }) => Promise<void>;
  selectProject: (projectId: string | null) => void;
  disableAdsProfileAction: (
    profileId: string,
    profileName: string,
    amount: number,
  ) => Promise<void>;
  launchAdsProfileAction: (
    profileId: string,
    profileName: string,
    amount: number,
  ) => Promise<void>;
  topUpWalletProfileAction: (
    profileId: string,
    profileName: string,
    amount: number,
  ) => Promise<void>;
  startProfileAction: (profileId: string, profileName: string) => Promise<void>;
  disableAdsSelectedProjectAction: (amount: number) => Promise<void>;
  launchAdsSelectedProjectAction: (amount: number) => Promise<void>;
  topUpWalletSelectedProjectAction: (amount: number) => Promise<void>;
  startSelectedProjectProfilesAction: () => Promise<void>;
  stopProfileAction: (profileId: string, profileName: string) => Promise<void>;
  stopSelectedProjectProfilesAction: () => Promise<void>;
  syncProfilesAction: () => Promise<void>;
  testConnectionSettingsAction: (payload: {
    protocol: "http" | "https";
    host: string;
    port: number;
  }) => Promise<UndetectableConnectionTestResult>;
  assignProfileAction: (
    profileRecordId: string,
    projectId: string,
    profileName: string,
  ) => Promise<void>;
  unassignProfileAction: (profileRecordId: string, profileName: string) => Promise<void>;
  updateSelectedProjectAction: (payload: {
    name: string;
    description: string;
    status: "active" | "paused" | "archived";
    notes: string;
  }) => Promise<void>;
};

const CashMasterDataContext = createContext<CashMasterDataContextValue | null>(null);

export function CashMasterDataProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connectionSettings, setConnectionSettings] =
    useState<UndetectableConnectionSettings | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const selectedProjectId = useAppUiStore((state) => state.selectedProjectId);
  const setSelectedProjectId = useAppUiStore((state) => state.setSelectedProjectId);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  async function refreshDashboardData() {
    setIsHydrating(true);

    try {
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

      const nextSelectedProjectId =
        projectsData.find((project) => project.id === selectedProjectId)?.id ??
        projectsData[0]?.id ??
        null;
      setSelectedProjectId(nextSelectedProjectId);
    } finally {
      setIsHydrating(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDashboardData().catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Не удалось загрузить данные панели",
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshSelectedProjectDetails() {
    if (!selectedProjectId) {
      return;
    }

    const freshProject = await getProject(selectedProjectId).catch(() => null);
    if (freshProject) {
      setProjects((current) =>
        current.map((project) => (project.id === freshProject.id ? freshProject : project)),
      );
    }
  }

  async function runAction<T>(
    action: () => Promise<T>,
    loadingMessage: string,
    successMessage: string,
    options: {
      refreshAfter?: boolean;
      shouldRefreshSelectedProject?: boolean;
      onSuccess?: (result: T) => Promise<void> | void;
    } = {},
  ) {
    setIsMutating(true);

    try {
      await runToastAction({
        action: async () => {
          const result = await action();

          if (options.refreshAfter ?? true) {
            await refreshDashboardData();
          }

          if (options.shouldRefreshSelectedProject) {
            await refreshSelectedProjectDetails();
          }

          return result;
        },
        loadingMessage,
        successMessage,
        onSuccess: options.onSuccess,
      });
    } finally {
      setIsMutating(false);
    }
  }

  const value: CashMasterDataContextValue = {
    connectionSettings,
    isHydrating,
    isMutating,
    jobs,
    profiles,
    projects,
    selectedProject,
    createProjectAction: async (payload) => {
      await runAction(
        () => createProject(payload),
        "Создаю проект...",
        "Проект создан",
      );
    },
    refreshAll: async () => {
      await runToastAction({
        action: refreshDashboardData,
        loadingMessage: "Обновляю данные...",
        successMessage: "Данные обновлены",
      });
    },
    saveConnectionSettingsAction: async (payload) => {
      await runAction<UndetectableConnectionSettings>(
        () => saveUndetectableConnectionSettings(payload),
        "Сохраняю настройки подключения...",
        "Настройки подключения сохранены",
        {
          refreshAfter: false,
          onSuccess: (saved) => setConnectionSettings(saved),
        },
      );
    },
    selectProject: (projectId) => setSelectedProjectId(projectId),
    disableAdsProfileAction: async (profileId, profileName, amount) => {
      await runAction(
        () => disableAdsProfile(profileId, amount),
        `Создаю задачу «Отключить рекламу» для ${profileName}...`,
        `Задача «Отключить рекламу» создана для ${profileName}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    launchAdsProfileAction: async (profileId, profileName, amount) => {
      await runAction(
        () => launchAdsProfile(profileId, amount),
        `Создаю задачу «Запустить рекламу» для ${profileName}...`,
        `Задача «Запустить рекламу» создана для ${profileName}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    topUpWalletProfileAction: async (profileId, profileName, amount) => {
      await runAction(
        () => topUpWalletProfile(profileId, amount),
        `Создаю задачу «Пополнить кошелек» для ${profileName}...`,
        `Задача «Пополнить кошелек» создана для ${profileName}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    startProfileAction: async (profileId, profileName) => {
      await runAction(
        () => startProfile(profileId),
        `Создаю задачу на запуск для ${profileName}...`,
        `Задача на запуск создана для ${profileName}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    disableAdsSelectedProjectAction: async (amount) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => disableAdsProjectProfiles(selectedProject.id, amount),
        `Создаю задачу «Отключить рекламу» для проекта ${selectedProject.name}...`,
        `Задача «Отключить рекламу» создана для проекта ${selectedProject.name}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    launchAdsSelectedProjectAction: async (amount) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => launchAdsProjectProfiles(selectedProject.id, amount),
        `Создаю задачу «Запустить рекламу» для проекта ${selectedProject.name}...`,
        `Задача «Запустить рекламу» создана для проекта ${selectedProject.name}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    topUpWalletSelectedProjectAction: async (amount) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => topUpWalletProjectProfiles(selectedProject.id, amount),
        `Создаю задачу «Пополнить кошелек» для проекта ${selectedProject.name}...`,
        `Задача «Пополнить кошелек» создана для проекта ${selectedProject.name}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    startSelectedProjectProfilesAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => startProjectProfiles(selectedProject.id),
        `Создаю задачу на запуск проекта ${selectedProject.name}...`,
        `Задача на запуск проекта ${selectedProject.name} создана`,
        { shouldRefreshSelectedProject: true },
      );
    },
    stopProfileAction: async (profileId, profileName) => {
      await runAction(
        () => stopProfile(profileId),
        `Создаю задачу на остановку для ${profileName}...`,
        `Задача на остановку создана для ${profileName}`,
        { shouldRefreshSelectedProject: true },
      );
    },
    stopSelectedProjectProfilesAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => stopProjectProfiles(selectedProject.id),
        `Создаю задачу на остановку проекта ${selectedProject.name}...`,
        `Задача на остановку проекта ${selectedProject.name} создана`,
        { shouldRefreshSelectedProject: true },
      );
    },
    syncProfilesAction: async () => {
      await runAction(
        () => syncProfiles(),
        "Подтягиваю профили из Detect...",
        "Синхронизация профилей завершена",
      );
    },
    testConnectionSettingsAction: async (payload) => {
      return runToastAction({
        action: () => testUndetectableConnectionSettings(payload),
        loadingMessage: "Проверяю подключение к Undetectable API...",
        successMessage: (result) =>
          `Соединение с ${result.baseUrl} установлено, доступно профилей: ${result.profileCount}.`,
      });
    },
    assignProfileAction: async (profileRecordId, projectId, profileName) => {
      await runAction(
        () => assignProfile(profileRecordId, projectId),
        `Привязываю профиль ${profileName}...`,
        `Профиль ${profileName} привязан`,
        { shouldRefreshSelectedProject: true },
      );
    },
    unassignProfileAction: async (profileRecordId, profileName) => {
      await runAction(
        () => unassignProfile(profileRecordId),
        `Отвязываю профиль ${profileName}...`,
        `Профиль ${profileName} отвязан`,
        { shouldRefreshSelectedProject: true },
      );
    },
    updateSelectedProjectAction: async (payload) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => updateProject(selectedProject.id, payload),
        "Сохраняю проект...",
        "Проект обновлён",
        { shouldRefreshSelectedProject: true },
      );
    },
  };

  return (
    <CashMasterDataContext.Provider value={value}>
      {children}
    </CashMasterDataContext.Provider>
  );
}

export function useCashMasterData() {
  const context = useContext(CashMasterDataContext);

  if (!context) {
    throw new Error("useCashMasterData must be used within CashMasterDataProvider");
  }

  return context;
}
