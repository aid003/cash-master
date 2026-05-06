"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppUiState = {
  selectedProjectId: string | null;
  selectedProfileId: string | null;
  profileSearch: string;
  profileStatusFilter: string;
  profileAssignmentFilter: "all" | "assigned" | "unassigned";
  setSelectedProjectId: (projectId: string | null) => void;
  setSelectedProfileId: (profileId: string | null) => void;
  setProfileSearch: (value: string) => void;
  setProfileStatusFilter: (value: string) => void;
  setProfileAssignmentFilter: (value: "all" | "assigned" | "unassigned") => void;
};

export const useAppUiStore = create<AppUiState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedProfileId: null,
      profileSearch: "",
      profileStatusFilter: "all",
      profileAssignmentFilter: "all",
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedProfileId: (selectedProfileId) => set({ selectedProfileId }),
      setProfileSearch: (profileSearch) => set({ profileSearch }),
      setProfileStatusFilter: (profileStatusFilter) => set({ profileStatusFilter }),
      setProfileAssignmentFilter: (profileAssignmentFilter) =>
        set({ profileAssignmentFilter }),
    }),
    {
      name: "cash-master-ui",
      partialize: ({
        selectedProjectId,
        selectedProfileId,
        profileSearch,
        profileStatusFilter,
        profileAssignmentFilter,
      }) => ({
        selectedProjectId,
        selectedProfileId,
        profileSearch,
        profileStatusFilter,
        profileAssignmentFilter,
      }),
    },
  ),
);
