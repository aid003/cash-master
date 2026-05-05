import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job as BullJob } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { JobType, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { UndetectableApiService } from '../profiles/undetectable-api.service';
import { PROFILE_OPERATIONS_QUEUE } from './jobs.constants';
import { ProfileActionsOrchestratorService } from './profile-actions-orchestrator.service';
import { JobsService } from './jobs.service';
import {
  ActionExecutionError,
  type AvitoActionPayload,
  type AvitoActionResult,
  type ProfileActionType,
} from './profile-actions.types';

@Injectable()
@Processor(PROFILE_OPERATIONS_QUEUE, { concurrency: 5 })
export class JobsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly profilesService: ProfilesService,
    private readonly undetectableApiService: UndetectableApiService,
    private readonly profileActionsOrchestrator: ProfileActionsOrchestratorService,
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
      const payload = this.getActionPayload(jobItem.payloadJson, jobItem.job.type);
      let result: AvitoActionResult;

      if (payload.action === 'start' || payload.action === 'stop') {
        result = await this.executeDirectProfileAction(jobItem.profile.id, jobItem.profile.profileId, payload.action);
      } else {
        result = await this.profileActionsOrchestrator.execute(jobItem.id, payload);
      }

      if (this.isSuccessfulResult(result)) {
        await this.jobsService.markItemCompleted(
          jobItem.id,
          result as Prisma.InputJsonValue,
        );
      } else {
        await this.jobsService.markItemFailedWithResult(
          jobItem.id,
          result.message,
          result as Prisma.InputJsonValue,
        );
      }
    } catch (error) {
      const payload = this.getActionPayload(jobItem.payloadJson, jobItem.job.type);
      const failureResult = this.getFailureResult(error, payload.action);
      await this.jobsService.markItemFailedWithResult(
        jobItem.id,
        failureResult.message,
        failureResult as Prisma.InputJsonValue,
      );
    }
  }

  private async executeDirectProfileAction(
    profileRecordId: string,
    externalProfileId: string,
    action: 'start' | 'stop',
  ): Promise<AvitoActionResult> {
    const startedAt = new Date();
    let rawResult: Record<string, unknown>;

    if (action === 'start') {
      rawResult = await this.undetectableApiService.startProfile(externalProfileId);
    } else {
      rawResult = await this.undetectableApiService.stopProfile(externalProfileId);
    }

    await this.profilesService.refreshRuntimeSnapshot(profileRecordId);

    return {
      action,
      outcomeCode: action === 'start' ? 'PROFILE_STARTED' : 'PROFILE_STOPPED',
      message:
        action === 'start'
          ? 'Profile started successfully'
          : 'Profile stopped successfully',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      runnerMode: 'undetectable',
      rawResult,
      rawError: null,
      steps: [
        {
          code: action === 'start' ? 'start_profile' : 'stop_profile',
          message:
            action === 'start'
              ? 'Undetectable profile start request completed'
              : 'Undetectable profile stop request completed',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private getActionPayload(
    payloadJson: Prisma.JsonValue | null,
    jobType: JobType,
  ): AvitoActionPayload {
    if (payloadJson && typeof payloadJson === 'object' && !Array.isArray(payloadJson)) {
      const payload = payloadJson as Record<string, unknown>;
      const action = payload.action;

      if (this.isProfileActionType(action)) {
        return payload as AvitoActionPayload;
      }
    }

    const legacyAction: ProfileActionType =
      jobType === JobType.START_PROFILES ? 'start' : 'stop';

    return {
      action: legacyAction,
      requestedByUserId: '',
      requestedAt: new Date().toISOString(),
      projectId: null,
      profileRecordId: '',
    };
  }

  private getFailureResult(
    error: unknown,
    fallbackAction: ProfileActionType,
  ): AvitoActionResult {
    if (error instanceof ActionExecutionError) {
      return error.result;
    }

    const message = error instanceof Error ? error.message : 'Unknown job error';
    return {
      action: fallbackAction,
      outcomeCode: 'JOB_FAILED',
      message,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      runnerMode: 'stub',
      rawResult: null,
      rawError:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : { message },
    };
  }

  private isProfileActionType(value: unknown): value is ProfileActionType {
    return (
      value === 'start' ||
      value === 'stop' ||
      value === 'disable_ads' ||
      value === 'withdraw' ||
      value === 'launch_ads' ||
      value === 'top_up_wallet'
    );
  }

  private isSuccessfulResult(result: AvitoActionResult) {
    return (
      result.outcomeCode === 'PROFILE_STARTED' ||
      result.outcomeCode === 'PROFILE_STOPPED' ||
      result.outcomeCode === 'TOP_UP_WALLET_STUB' ||
      result.outcomeCode.endsWith('_COMPLETED')
    );
  }
}
