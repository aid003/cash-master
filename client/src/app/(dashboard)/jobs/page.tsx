"use client";

import {
  formatDateTime,
  getStatusTone,
  prettifyStatus,
  totalJobItems,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { Badge } from "@/shared/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export default function JobsPage() {
  const { jobs } = useCashMasterData();

  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <Card key={job.id} className="bg-white/[0.03]">
          <CardHeader>
            <div className="flex items-start justify-between gap-6">
              <div>
                <CardTitle>{job.title}</CardTitle>
                <CardDescription>
                  {job.project?.name ?? "Без проекта"} · {formatDateTime(job.createdAt)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Badge variant={getStatusTone(job.status)}>{prettifyStatus(job.status)}</Badge>
                <Badge variant="neutral">{totalJobItems(job)} элементов</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {job.summary ?? job.error ?? "Задача поставлена в очередь"}
            </p>

            <div className="grid gap-2">
              {job.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_140px_180px] items-center gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.025] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.profile.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.profile.profileId}
                    </p>
                  </div>
                  <Badge variant={getStatusTone(item.status)}>{prettifyStatus(item.status)}</Badge>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(item.finishedAt ?? item.startedAt)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {jobs.length === 0 ? (
        <Card className="bg-white/[0.03]">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            История задач пока пуста.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
