import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job as BullJob } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { JobType, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { UndetectableApiService } from '../profiles/undetectable-api.service';
import { PROFILE_OPERATIONS_QUEUE } from './jobs.constants';
import { JobsService } from './jobs.service';

@Injectable()
@Processor(PROFILE_OPERATIONS_QUEUE, { concurrency: 5 })
export class JobsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly profilesService: ProfilesService,
    private readonly undetectableApiService: UndetectableApiService,
  ) {
    super();
  }

  async process(job: BullJob<{ jobItemId: string }>): Promise<void> {
    const jobItem = await this.prisma.jobItem.findUnique({
      where: { id: job.data.jobItemId },
      include: {
        job: true,
        profile: true,
      },
    });

    if (!jobItem) {
      return;
    }

    await this.jobsService.markItemRunning(jobItem.id);

    try {
      let result: Record<string, unknown>;

      if (jobItem.job.type === JobType.START_PROFILES) {
        result = await this.undetectableApiService.startProfile(jobItem.profile.profileId);
      } else {
        result = await this.undetectableApiService.stopProfile(jobItem.profile.profileId);
      }

      await this.profilesService.refreshRuntimeSnapshot(jobItem.profileId);
      await this.jobsService.markItemCompleted(
        jobItem.id,
        result as Prisma.InputJsonValue,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown job error';
      await this.jobsService.markItemFailed(jobItem.id, message);
    }
  }
}
