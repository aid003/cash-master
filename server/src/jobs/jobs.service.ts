import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobItemStatus,
  JobStatus,
  JobType,
  Prisma,
  type UndetectableProfile,
  type JobItem,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { ProjectsService } from '../projects/projects.service';
import { PROFILE_OPERATIONS_QUEUE } from './jobs.constants';

type ProfileAction = 'start' | 'stop';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly profilesService: ProfilesService,
    @InjectQueue(PROFILE_OPERATIONS_QUEUE)
    private readonly queue: Queue,
  ) {}

  listJobs() {
    return this.prisma.job.findMany({
      include: {
        project: {
          select: { id: true, name: true },
        },
        triggeredByUser: {
          select: { id: true, email: true },
        },
        items: {
          include: {
            profile: {
              select: {
                id: true,
                profileId: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        project: true,
        triggeredByUser: {
          select: { id: true, email: true },
        },
        items: {
          include: {
            profile: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async createSingleProfileJob(
    profileRecordId: string,
    action: ProfileAction,
    userId: string,
  ) {
    const profile = await this.profilesService.getProfileOrThrow(profileRecordId);

    return this.createJobForProfiles({
      title: `${action === 'start' ? 'Start' : 'Stop'} profile ${profile.name}`,
      action,
      profileRecordIds: [profileRecordId],
      projectId: profile.projectId ?? undefined,
      userId,
    });
  }

  async createProjectJob(
    projectId: string,
    action: ProfileAction,
    userId: string,
  ) {
    const project = await this.projectsService.ensureExists(projectId);
    const profiles = await this.prisma.undetectableProfile.findMany({
      where: {
        projectId,
        isMissing: false,
      },
      orderBy: { name: 'asc' },
    });

    if (profiles.length === 0) {
      throw new ConflictException('Project has no available profiles');
    }

    return this.createJobForProfiles({
      title: `${action === 'start' ? 'Start' : 'Stop'} profiles for ${project.name}`,
      action,
      profileRecordIds: profiles.map((profile: UndetectableProfile) => profile.id),
      projectId,
      userId,
    });
  }

  async markItemRunning(jobItemId: string) {
    const item = await this.prisma.jobItem.update({
      where: { id: jobItemId },
      data: {
        status: JobItemStatus.RUNNING,
        startedAt: new Date(),
      },
      include: {
        job: true,
      },
    });

    if (item.job.status === JobStatus.PENDING) {
      await this.prisma.job.update({
        where: { id: item.jobId },
        data: {
          status: JobStatus.RUNNING,
          startedAt: item.job.startedAt ?? new Date(),
        },
      });
    }

    return item;
  }

  async markItemCompleted(
    jobItemId: string,
    resultJson: Prisma.InputJsonValue,
  ) {
    const item = await this.prisma.jobItem.update({
      where: { id: jobItemId },
      data: {
        status: JobItemStatus.COMPLETED,
        finishedAt: new Date(),
        resultJson,
        error: null,
      },
    });

    await this.refreshJobStatus(item.jobId);
    return item;
  }

  async markItemFailed(jobItemId: string, error: string) {
    const item = await this.prisma.jobItem.update({
      where: { id: jobItemId },
      data: {
        status: JobItemStatus.FAILED,
        finishedAt: new Date(),
        error,
      },
    });

    await this.refreshJobStatus(item.jobId);
    return item;
  }

  async refreshJobStatus(jobId: string) {
    const items = await this.prisma.jobItem.findMany({
      where: { jobId },
      select: { status: true },
    });

    const total = items.length;
    const pending = items.filter((item: { status: JobItemStatus }) => item.status === JobItemStatus.PENDING).length;
    const running = items.filter((item: { status: JobItemStatus }) => item.status === JobItemStatus.RUNNING).length;
    const completed = items.filter((item: { status: JobItemStatus }) => item.status === JobItemStatus.COMPLETED).length;
    const failed = items.filter((item: { status: JobItemStatus }) => item.status === JobItemStatus.FAILED).length;
    const skipped = items.filter((item: { status: JobItemStatus }) => item.status === JobItemStatus.SKIPPED).length;

    const summary = `${completed}/${total} completed, ${failed} failed, ${skipped} skipped`;

    let status: JobStatus = JobStatus.PENDING;
    let finishedAt: Date | null = null;

    if (running > 0 || (pending > 0 && completed + failed + skipped > 0)) {
      status = JobStatus.RUNNING;
    } else if (pending === total) {
      status = JobStatus.PENDING;
    } else if (completed === total) {
      status = JobStatus.COMPLETED;
      finishedAt = new Date();
    } else if (completed === 0 && failed + skipped === total) {
      status = JobStatus.FAILED;
      finishedAt = new Date();
    } else if (pending === 0 && running === 0) {
      status = JobStatus.PARTIALLY_FAILED;
      finishedAt = new Date();
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        finishedAt,
        summary,
        ...(status === JobStatus.FAILED ? { error: summary } : {}),
      },
    });
  }

  private async createJobForProfiles(input: {
    title: string;
    action: ProfileAction;
    profileRecordIds: string[];
    projectId?: string;
    userId: string;
  }) {
    await this.ensureNoActiveConflicts(input.profileRecordIds);

    const type =
      input.action === 'start' ? JobType.START_PROFILES : JobType.STOP_PROFILES;

    const created = await this.prisma.job.create({
      data: {
        title: input.title,
        type,
        status: JobStatus.PENDING,
        projectId: input.projectId,
        triggeredByUserId: input.userId,
        items: {
          create: input.profileRecordIds.map((profileRecordId) => ({
            profileId: profileRecordId,
            status: JobItemStatus.PENDING,
            payloadJson: {
              action: input.action,
            } as Prisma.InputJsonValue,
            updatedByUserId: input.userId,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    await Promise.all(
      created.items.map((item: JobItem) =>
        this.queue.add(
          `${input.action}-${item.id}`,
          { jobItemId: item.id },
          {
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        ),
      ),
    );

    return this.getJob(created.id);
  }

  private async ensureNoActiveConflicts(profileRecordIds: string[]) {
    const activeItems = await this.prisma.jobItem.findMany({
      where: {
        profileId: {
          in: profileRecordIds,
        },
        status: {
          in: [JobItemStatus.PENDING, JobItemStatus.RUNNING],
        },
      },
      include: {
        profile: {
          select: {
            name: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (activeItems.length > 0) {
      const firstConflict = activeItems[0];
      throw new ConflictException(
        `Profile "${firstConflict.profile.name}" is already used by active job "${firstConflict.job.title}"`,
      );
    }
  }
}
