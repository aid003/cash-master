"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  assignProfile,
  createProject,
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
  withdrawProfile,
  withdrawProjectProfiles,
  type Job,
  type Profile,
  type Project,
  type UndetectableConnectionSettings,
  type UndetectableConnectionTestResult,
} from "@/shared/api/cash-master";
import { useAppUiStore } from "@/shared/store/app-ui-store";

type Feedback = {
  tone: "info" | "success" | "danger";
  text: string;
} | null;

type CashMasterDataContextValue = {
  connectionSettings: UndetectableConnectionSettings | null;
  feedback: Feedback;
  isHydrating: boolean;
  isMutating: boolean;
  jobs: Job[];
  profiles: Profile[];
  projects: Project[];
  selectedProject: Project | null;
  clearFeedback: () => void;
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
  disableAdsProfileAction: (profileId: string, profileName: string) => Promise<void>;
  launchAdsProfileAction: (profileId: string, profileName: string) => Promise<void>;
  topUpWalletProfileAction: (
    profileId: string,
    profileName: string,
    amount: number,
  ) => Promise<void>;
  startProfileAction: (profileId: string, profileName: string) => Promise<void>;
  disableAdsSelectedProjectAction: () => Promise<void>;
  launchAdsSelectedProjectAction: () => Promise<void>;
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
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedProjectId = useAppUiStore((state) => state.selectedProjectId);
  const setSelectedProjectId = useAppUiStore((state) => state.setSelectedProjectId);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  async function refreshAll() {
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
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Не удалось загрузить данные панели",
      });
    } finally {
      setIsHydrating(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(
    action: () => Promise<unknown>,
    successMessage: string,
    shouldRefreshSelectedProject = false,
  ) {
    setIsMutating(true);
    setFeedback(null);

    try {
      await action();
      await refreshAll();

      if (shouldRefreshSelectedProject && selectedProjectId) {
        const freshProject = await getProject(selectedProjectId).catch(() => null);
        if (freshProject) {
          setProjects((current) =>
            current.map((project) =>
              project.id === freshProject.id ? freshProject : project,
            ),
          );
        }
      }

      setFeedback({ tone: "success", text: successMessage });
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Операция завершилась с ошибкой",
      });
    } finally {
      setIsMutating(false);
    }
  }

  const value: CashMasterDataContextValue = {
    connectionSettings,
    feedback,
    isHydrating,
    isMutating,
    jobs,
    profiles,
    projects,
    selectedProject,
    clearFeedback: () => setFeedback(null),
    createProjectAction: async (payload) => {
      await runAction(() => createProject(payload), "Проект создан");
    },
    refreshAll: async () => {
      setFeedback({ tone: "info", text: "Обновляю данные..." });
      await refreshAll();
      setFeedback({ tone: "success", text: "Данные обновлены" });
    },
    saveConnectionSettingsAction: async (payload) => {
      await runAction(async () => {
        const saved = await saveUndetectableConnectionSettings(payload);
        setConnectionSettings(saved);
      }, "Настройки подключения сохранены");
    },
    selectProject: (projectId) => setSelectedProjectId(projectId),
    disableAdsProfileAction: async (profileId, profileName) => {
      await runAction(
        () => withdrawProfile(profileId),
        `Задача «Отключить рекламу» создана для ${profileName}`,
        true,
      );
    },
    launchAdsProfileAction: async (profileId, profileName) => {
      await runAction(
        () => launchAdsProfile(profileId),
        `Задача «Запустить рекламу» создана для ${profileName}`,
        true,
      );
    },
    topUpWalletProfileAction: async (profileId, profileName, amount) => {
      await runAction(
        () => topUpWalletProfile(profileId, amount),
        `Задача «Пополнить кошелек» создана для ${profileName}`,
        true,
      );
    },
    startProfileAction: async (profileId, profileName) => {
      await runAction(
        () => startProfile(profileId),
        `Задача на запуск создана для ${profileName}`,
        true,
      );
    },
    disableAdsSelectedProjectAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => withdrawProjectProfiles(selectedProject.id),
        `Задача «Отключить рекламу» создана для проекта ${selectedProject.name}`,
        true,
      );
    },
    launchAdsSelectedProjectAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => launchAdsProjectProfiles(selectedProject.id),
        `Задача «Запустить рекламу» создана для проекта ${selectedProject.name}`,
        true,
      );
    },
    topUpWalletSelectedProjectAction: async (amount) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => topUpWalletProjectProfiles(selectedProject.id, amount),
        `Задача «Пополнить кошелек» создана для проекта ${selectedProject.name}`,
        true,
      );
    },
    startSelectedProjectProfilesAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => startProjectProfiles(selectedProject.id),
        `Задача на запуск проекта ${selectedProject.name} создана`,
        true,
      );
    },
    stopProfileAction: async (profileId, profileName) => {
      await runAction(
        () => stopProfile(profileId),
        `Задача на остановку создана для ${profileName}`,
        true,
      );
    },
    stopSelectedProjectProfilesAction: async () => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => stopProjectProfiles(selectedProject.id),
        `Задача на остановку проекта ${selectedProject.name} создана`,
        true,
      );
    },
    syncProfilesAction: async () => {
      await runAction(() => syncProfiles(), "Синхронизация профилей завершена");
    },
    testConnectionSettingsAction: async (payload) => {
      return testUndetectableConnectionSettings(payload);
    },
    assignProfileAction: async (profileRecordId, projectId, profileName) => {
      await runAction(
        () => assignProfile(profileRecordId, projectId),
        `Профиль ${profileName} привязан`,
        true,
      );
    },
    unassignProfileAction: async (profileRecordId, profileName) => {
      await runAction(
        () => unassignProfile(profileRecordId),
        `Профиль ${profileName} отвязан`,
        true,
      );
    },
    updateSelectedProjectAction: async (payload) => {
      if (!selectedProject) {
        return;
      }

      await runAction(
        () => updateProject(selectedProject.id, payload),
        "Проект обновлён",
        true,
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
