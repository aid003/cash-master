"use client";

import { CirclePlay, CircleStop, Link2, Search, Unlink2 } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import {
  formatDateTime,
  getStatusTone,
  prettifyStatus,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { useAppUiStore } from "@/shared/store/app-ui-store";
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

export default function ProfilesPage() {
  const {
    assignProfileAction,
    isMutating,
    profiles,
    projects,
    selectedProject,
    startProfileAction,
    stopProfileAction,
    unassignProfileAction,
  } = useCashMasterData();
  const profileSearch = useAppUiStore((state) => state.profileSearch);
  const setProfileSearch = useAppUiStore((state) => state.setProfileSearch);
  const deferredSearch = useDeferredValue(profileSearch);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});

  const visibleProfiles = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (!query) {
      return profiles;
    }

    return profiles.filter((profile) =>
      [
        profile.name,
        profile.profileId,
        profile.folder ?? "",
        profile.project?.name ?? "",
        profile.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [deferredSearch, profiles]);

  return (
    <div className="grid gap-4">
      <Card className="bg-white/[0.03]">
        <CardHeader>
          <CardTitle>Поиск и назначение</CardTitle>
          <CardDescription>
            Поиск по имени, ID, папке, тегам и текущему проекту.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[1fr_280px] gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={profileSearch}
              onChange={(event) => setProfileSearch(event.target.value)}
              className="pl-10"
              placeholder="Поиск по профилям, тегам и проекту"
            />
          </div>
          <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.025] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Текущий проект
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-foreground">
              {selectedProject?.name ?? "Не выбран"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {visibleProfiles.map((profile) => (
          <Card key={profile.id} className="bg-white/[0.03]">
            <CardContent className="grid grid-cols-[1fr_320px] gap-5 py-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-foreground">{profile.name}</p>
                  <Badge variant={getStatusTone(profile.status)}>
                    {prettifyStatus(profile.status)}
                  </Badge>
                  {profile.project ? (
                    <Badge variant="accent">{profile.project.name}</Badge>
                  ) : (
                    <Badge variant="neutral">Без проекта</Badge>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{profile.profileId}</p>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>Папка: {profile.folder ?? "—"}</span>
                  <span>Debug: {profile.debugPort ?? "—"}</span>
                  <span>Последняя синхронизация: {formatDateTime(profile.lastSeenAt)}</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Теги: {profile.tags.length > 0 ? profile.tags.join(", ") : "—"}
                </p>
              </div>

              <div className="grid gap-3">
                {profile.project ? (
                  <Button
                    variant="outline"
                    disabled={isMutating}
                    onClick={() => void unassignProfileAction(profile.id, profile.name)}
                  >
                    <Unlink2 className="size-4" />
                    Отвязать
                  </Button>
                ) : (
                  <>
                    <Select
                      value={assignmentTargets[profile.id] ?? selectedProject?.id ?? ""}
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
                      disabled={
                        isMutating || !(assignmentTargets[profile.id] ?? selectedProject?.id)
                      }
                      onClick={() =>
                        void assignProfileAction(
                          profile.id,
                          assignmentTargets[profile.id] ?? selectedProject?.id ?? "",
                          profile.name,
                        )
                      }
                    >
                      <Link2 className="size-4" />
                      Привязать
                    </Button>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    disabled={isMutating || profile.isMissing}
                    onClick={() => void startProfileAction(profile.id, profile.name)}
                  >
                    <CirclePlay className="size-4" />
                    Старт
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isMutating || profile.isMissing}
                    onClick={() => void stopProfileAction(profile.id, profile.name)}
                  >
                    <CircleStop className="size-4" />
                    Стоп
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
