"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  formatDateTime,
  getStatusTone,
  prettifyStatus,
  summarizeJobProgress,
  totalJobItems,
} from "@/features/cash-master/lib/presentation";
import { useCashMasterData } from "@/features/cash-master/model/cash-master-data-provider";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";

export default function JobsPage() {
  const { jobs } = useCashMasterData();
  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([]);

  function toggleJob(jobId: string) {
    setExpandedJobIds((current) =>
      current.includes(jobId)
        ? current.filter((currentJobId) => currentJobId !== jobId)
        : [...current, jobId],
    );
  }

  return (
    <div className="grid gap-3">
      {jobs.map((job) => {
        const isExpanded = expandedJobIds.includes(job.id);
        const summary = job.summary ?? summarizeJobProgress(job);
        const hasErrorDetails = job.status === "FAILED" || job.status === "PARTIALLY_FAILED";

        return (
          <Card key={job.id} className="overflow-hidden bg-white/[0.03]">
            <button
              type="button"
              onClick={() => toggleJob(job.id)}
              className="w-full text-left"
              aria-expanded={isExpanded}
            >
              <CardContent className="grid gap-4 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <ChevronDown
                        className={cn(
                          "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {job.title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {job.project?.name ?? "Без проекта"} · {formatDateTime(job.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={getStatusTone(job.status)}>{prettifyStatus(job.status)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {totalJobItems(job)} элемент{totalJobItems(job) === 1 ? "" : totalJobItems(job) < 5 ? "а" : "ов"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-1 pl-7">
                  <p className="text-sm text-foreground/84">{summary}</p>
                  {hasErrorDetails && job.error ? (
                    <p className="text-sm text-muted-foreground">{job.error}</p>
                  ) : null}
                </div>
              </CardContent>
            </button>

            {isExpanded ? (
              <CardContent className="border-t border-white/6 px-5 py-4">
                <div className="grid gap-2 pl-7">
                  {job.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1rem] border border-white/6 bg-white/[0.02] px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.profile.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.profile.profileId}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm text-foreground/78">{prettifyStatus(item.status)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(item.finishedAt ?? item.startedAt)}
                          </p>
                        </div>
                      </div>

                      {item.error ? (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {item.error}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : null}
          </Card>
        );
      })}

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
