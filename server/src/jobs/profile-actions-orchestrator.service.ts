import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileLifecycleStatus, type Prisma } from '@prisma/client';
import puppeteer from 'puppeteer';

import { PrismaService } from '../database/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { UndetectableApiService } from '../profiles/undetectable-api.service';
import { AvitoActionRunnerService } from './avito-action-runner.service';
import {
  ActionExecutionError,
  type ActionExecutionContext,
  type ActionStep,
  type AvitoActionPayload,
  type AvitoActionResult,
  type ProfileActionType,
} from './profile-actions.types';

@Injectable()
export class ProfileActionsOrchestratorService {
  private static readonly PROFILE_READY_TIMEOUT_MS = 45_000;
  private static readonly PROFILE_READY_POLL_MS = 1_500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
    private readonly undetectableApiService: UndetectableApiService,
    private readonly avitoActionRunner: AvitoActionRunnerService,
  ) {}

  async execute(jobItemId: string, payload: AvitoActionPayload): Promise<AvitoActionResult> {
    const startedAt = new Date();
    const steps: ActionStep[] = [];
    let context = await this.buildContext(jobItemId, payload);
    let startedByOrchestrator = false;
    let browserReadyConfirmed = false;
    let executionError: ActionExecutionError | null = null;

    this.validateContext(context);

    try {
      if (this.shouldAutoStart(context)) {
        steps.push(this.createStep('auto_start_requested', 'Starting profile before Avito action'));
        await this.undetectableApiService.startProfile(context.profile.profileId);
        startedByOrchestrator = true;
        await this.profilesService.refreshRuntimeSnapshot(context.profile.id);
        context = await this.buildContext(jobItemId, payload);
        this.validateContext(context);
        steps.push(this.createStep('auto_start_completed', 'Profile started successfully'));
      } else {
        steps.push(this.createStep('existing_session_reused', 'Using existing browser session'));
      }

      steps.push(
        this.createStep(
          'browser_ready_wait_started',
          'Waiting for browser websocket and page readiness',
        ),
      );
      const readiness = await this.waitForBrowserReady(context);
      browserReadyConfirmed = true;
      steps.push(
        this.createStep(
          'browser_ready_confirmed',
          `Browser ready at ${readiness.activePageUrl} with ${readiness.pageCount} page(s)`,
        ),
      );

      const runnerResult = await this.executeRunner(context);
      steps.push(...(runnerResult.steps ?? []));
      steps.push(this.createStep('runner_completed', runnerResult.message));

      return {
        action: payload.action,
        outcomeCode: runnerResult.outcomeCode,
        message: runnerResult.message,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        runnerMode: runnerResult.runnerMode,
        rawResult: runnerResult.rawResult,
        rawError: null,
        steps,
      };
    } catch (error) {
      executionError =
        error instanceof ActionExecutionError
          ? error
          : new ActionExecutionError(
              error instanceof Error ? error.message : 'Unknown action execution error',
              this.buildFailureResult(
                payload.action,
                startedAt,
                error instanceof Error ? error.message : 'Unknown action execution error',
                'ACTION_EXECUTION_FAILED',
                error,
                steps,
              ),
            );
      throw executionError;
    } finally {
      if (startedByOrchestrator && browserReadyConfirmed) {
        try {
          steps.push(this.createStep('auto_stop_requested', 'Stopping profile after Avito action'));
          await this.undetectableApiService.stopProfile(context.profile.profileId);
          await this.profilesService.refreshRuntimeSnapshot(context.profile.id);
          steps.push(this.createStep('auto_stop_completed', 'Profile stopped successfully'));
        } catch (stopError) {
          const stopFailure = this.buildFailureResult(
            payload.action,
            startedAt,
            stopError instanceof Error ? stopError.message : 'Failed to stop profile after action',
            'AUTO_STOP_FAILED',
            stopError,
            steps,
          );

          if (executionError) {
            executionError.result.steps = steps;
            executionError.result.rawError = {
              execution: executionError.result.rawError,
              autoStop: stopFailure.rawError,
            };
            throw executionError;
          }

          throw new ActionExecutionError(stopFailure.message, stopFailure);
        }
      }
    }
  }

  private async executeRunner(context: ActionExecutionContext) {
    switch (context.action.action) {
      case 'disable_ads':
      case 'withdraw':
        return this.avitoActionRunner.executeWithdraw(context);
      case 'launch_ads':
        return this.avitoActionRunner.executeLaunchAds(context);
      case 'top_up_wallet':
        return this.avitoActionRunner.executeTopUpWallet(context);
      default:
        throw new ConflictException(`Unsupported Avito action: ${context.action.action}`);
    }
  }

  private async buildContext(
    jobItemId: string,
    payload: AvitoActionPayload,
  ): Promise<ActionExecutionContext> {
    const item = await this.prisma.jobItem.findUnique({
      where: { id: jobItemId },
      include: {
        job: {
          select: {
            id: true,
            projectId: true,
            title: true,
            type: true,
          },
        },
        profile: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Job item not found');
    }

    return {
      job: item.job,
      jobItem: {
        id: item.id,
        profileId: item.profileId,
      },
      correlationId: `${item.jobId}:${item.id}`,
      userId: payload.requestedByUserId,
      profile: item.profile,
      runtimeSnapshot: {
        status: item.profile.status,
        debugPort: item.profile.debugPort,
        websocketLink: item.profile.websocketLink,
        isMissing: item.profile.isMissing,
        lastSeenAt: item.profile.lastSeenAt?.toISOString() ?? null,
      },
      action: payload,
    };
  }

  private validateContext(context: ActionExecutionContext) {
    if (context.profile.isMissing) {
      throw new ActionExecutionError(
        'Missing profile cannot be used for Avito actions',
        this.buildFailureResult(
          context.action.action,
          new Date(),
          'Missing profile cannot be used for Avito actions',
          'PROFILE_MISSING',
          { profileRecordId: context.profile.id },
        ),
      );
    }

    if (context.action.projectId && context.profile.projectId !== context.action.projectId) {
      throw new ActionExecutionError(
        'Profile is not assigned to the requested project',
        this.buildFailureResult(
          context.action.action,
          new Date(),
          'Profile is not assigned to the requested project',
          'PROJECT_ASSIGNMENT_MISMATCH',
          {
            expectedProjectId: context.action.projectId,
            actualProjectId: context.profile.projectId,
          },
        ),
      );
    }

    if (context.action.action === 'top_up_wallet' && !(context.action.amount > 0)) {
      throw new ActionExecutionError(
        'Top up amount must be a positive number',
        this.buildFailureResult(
          context.action.action,
          new Date(),
          'Top up amount must be a positive number',
          'INVALID_TOP_UP_AMOUNT',
          { amount: context.action.amount },
        ),
      );
    }
  }

  private shouldAutoStart(context: ActionExecutionContext) {
    return (
      context.runtimeSnapshot.status !== ProfileLifecycleStatus.STARTED ||
      !context.runtimeSnapshot.debugPort ||
      !context.runtimeSnapshot.websocketLink
    );
  }

  private async waitForBrowserReady(context: ActionExecutionContext) {
    const startedAt = Date.now();
    let lastReason = 'Browser websocket is not available yet';

    while (Date.now() - startedAt < ProfileActionsOrchestratorService.PROFILE_READY_TIMEOUT_MS) {
      await this.profilesService.refreshRuntimeSnapshot(context.profile.id);
      const freshContext = await this.buildContext(context.jobItem.id, context.action);

      if (
        freshContext.runtimeSnapshot.status !== ProfileLifecycleStatus.STARTED ||
        !freshContext.runtimeSnapshot.websocketLink
      ) {
        lastReason = `Profile state is ${freshContext.runtimeSnapshot.status}, websocket pending`;
        await this.sleep(ProfileActionsOrchestratorService.PROFILE_READY_POLL_MS);
        continue;
      }

      let browser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;
      try {
        browser = await puppeteer.connect({
          browserWSEndpoint: freshContext.runtimeSnapshot.websocketLink,
          defaultViewport: null,
        });

        const pages = await browser.pages();
        const page = pages[0] ?? (await browser.newPage());
        const readyState = await page.evaluate(() => document.readyState);

        return {
          pageCount: pages.length || 1,
          activePageUrl: page.url() || 'about:blank',
          readyState,
        };
      } catch (error) {
        lastReason = error instanceof Error ? error.message : 'Unknown browser readiness error';
        await this.sleep(ProfileActionsOrchestratorService.PROFILE_READY_POLL_MS);
      } finally {
        if (browser) {
          await browser.disconnect();
        }
      }
    }

    throw new ActionExecutionError(
      `Browser did not become ready within ${ProfileActionsOrchestratorService.PROFILE_READY_TIMEOUT_MS}ms: ${lastReason}`,
      this.buildFailureResult(
        context.action.action,
        new Date(),
        `Browser did not become ready within ${ProfileActionsOrchestratorService.PROFILE_READY_TIMEOUT_MS}ms: ${lastReason}`,
        'BROWSER_NOT_READY',
        {
          profileId: context.profile.profileId,
          websocketLinkPresent: Boolean(context.runtimeSnapshot.websocketLink),
          status: context.runtimeSnapshot.status,
          timeoutMs: ProfileActionsOrchestratorService.PROFILE_READY_TIMEOUT_MS,
          lastReason,
        },
      ),
    );
  }

  private buildFailureResult(
    action: ProfileActionType,
    startedAt: Date,
    message: string,
    outcomeCode: string,
    rawError: unknown,
    steps?: ActionStep[],
  ): AvitoActionResult {
    return {
      action,
      outcomeCode,
      message,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      runnerMode: 'stub',
      rawResult: null,
      rawError: this.serializeError(rawError),
      steps,
    };
  }

  private createStep(code: string, message: string): ActionStep {
    return {
      code,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private serializeError(error: unknown): Prisma.InputJsonValue {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    if (error === null || error === undefined) {
      return {
        message: 'Unknown error',
      };
    }

    if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean') {
      return {
        message: String(error),
      };
    }

    return JSON.parse(JSON.stringify(error));
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
