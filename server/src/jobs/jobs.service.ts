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
import {
  type AvitoActionPayload,
  type ProfileActionType,
} from './profile-actions.types';

type CreateActionOptions = {
  amount?: number;
};

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
    action: ProfileActionType,
    userId: string,
    options: CreateActionOptions = {},
  ) {
    const profile = await this.profilesService.getProfileOrThrow(profileRecordId);
    this.validateActionInput(action, options);

    return this.createJobForProfiles({
      title: `${this.getActionVerb(action)} profile ${profile.name}`,
      action,
      profileRecordIds: [profileRecordId],
      projectId: profile.projectId ?? undefined,
      userId,
      options,
    });
  }

  async createProjectJob(
    projectId: string,
    action: ProfileActionType,
    userId: string,
    options: CreateActionOptions = {},
  ) {
    const project = await this.projectsService.ensureExists(projectId);
    this.validateActionInput(action, options);
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
      title: `${this.getActionVerb(action)} profiles for ${project.name}`,
      action,
      profileRecordIds: profiles.map((profile: UndetectableProfile) => profile.id),
      projectId,
      userId,
      options,
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
    return this.markItemFailedWithResult(jobItemId, error);
  }

  async markItemFailedWithResult(
    jobItemId: string,
    error: string,
    resultJson?: Prisma.InputJsonValue,
  ) {
    const item = await this.prisma.jobItem.update({
      where: { id: jobItemId },
      data: {
        status: JobItemStatus.FAILED,
        finishedAt: new Date(),
        error,
        ...(resultJson !== undefined ? { resultJson } : {}),
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
    action: ProfileActionType;
    profileRecordIds: string[];
    projectId?: string;
    userId: string;
    options?: CreateActionOptions;
  }) {
    await this.ensureNoActiveConflicts(input.profileRecordIds);

    const created = await this.prisma.job.create({
      data: {
        title: input.title,
        type: JobType.PROFILE_ACTIONS,
        status: JobStatus.PENDING,
        projectId: input.projectId,
        triggeredByUserId: input.userId,
        items: {
          create: input.profileRecordIds.map((profileRecordId) => {
            const payload = this.buildActionPayload({
              action: input.action,
              profileRecordId,
              projectId: input.projectId ?? null,
              requestedByUserId: input.userId,
              options: input.options,
            });

            return {
              profileId: profileRecordId,
              status: JobItemStatus.PENDING,
              payloadJson: payload as Prisma.InputJsonValue,
              updatedByUserId: input.userId,
            };
          }),
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

  private validateActionInput(action: ProfileActionType, options: CreateActionOptions) {
    if (
      (action === 'top_up_wallet' || action === 'disable_ads' || action === 'withdraw') &&
      !(typeof options.amount === 'number' && Number.isInteger(options.amount) && options.amount > 0)
    ) {
      throw new ConflictException(`${this.getActionVerb(action)} amount must be a positive integer`);
    }
  }

  private buildActionPayload(input: {
    action: ProfileActionType;
    profileRecordId: string;
    projectId: string | null;
    requestedByUserId: string;
    options?: CreateActionOptions;
  }): AvitoActionPayload {
    const basePayload = {
      requestedByUserId: input.requestedByUserId,
      requestedAt: new Date().toISOString(),
      projectId: input.projectId,
      profileRecordId: input.profileRecordId,
    };

    if (
      input.action === 'top_up_wallet' ||
      input.action === 'disable_ads' ||
      input.action === 'withdraw'
    ) {
      return {
        ...basePayload,
        action: input.action,
        amount: input.options?.amount ?? 0,
        currency: 'RUB',
      };
    }

    return {
      ...basePayload,
      action: input.action,
    };
  }

  private getActionVerb(action: ProfileActionType) {
    switch (action) {
      case 'start':
        return 'Start';
      case 'stop':
        return 'Stop';
      case 'disable_ads':
        return 'Disable ads';
      case 'withdraw':
        return 'Withdraw';
      case 'launch_ads':
        return 'Launch ads';
      case 'top_up_wallet':
        return 'Top up wallet';
    }
  }
}
