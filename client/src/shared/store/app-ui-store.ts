"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppUiState = {
  selectedProjectId: string | null;
  profileSearch: string;
  setSelectedProjectId: (projectId: string | null) => void;
  setProfileSearch: (value: string) => void;
};

export const useAppUiStore = create<AppUiState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      profileSearch: "",
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setProfileSearch: (profileSearch) => set({ profileSearch }),
    }),
    {
      name: "cash-master-ui",
      partialize: ({ selectedProjectId, profileSearch }) => ({
        selectedProjectId,
        profileSearch,
      }),
    },
  ),
);
