import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProfileLifecycleStatus, type Prisma } from '@prisma/client';
import puppeteer from 'puppeteer';
import { inspect } from 'node:util';

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
  private static readonly AVITO_HEADLESS_CHROME_FLAGS = '--headless=new';
  private readonly logger = new Logger(ProfileActionsOrchestratorService.name);

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
        steps.push(
          this.createStep(
            'auto_start_requested',
            'Starting profile in headless mode before Avito action',
          ),
        );
        const startResult = await this.undetectableApiService.startProfile(context.profile.profileId, {
          chromeFlags: ProfileActionsOrchestratorService.AVITO_HEADLESS_CHROME_FLAGS,
        });
        this.logger.log({
          message: 'Undetectable profile start returned',
          correlationId: context.correlationId,
          profileRecordId: context.profile.id,
          profileId: context.profile.profileId,
          startResult,
          chromeFlags: ProfileActionsOrchestratorService.AVITO_HEADLESS_CHROME_FLAGS,
        });
        startedByOrchestrator = true;
        await this.persistStartProfileResult(context.profile.id, startResult);
        steps.push(
          this.createStep(
            'auto_start_response_received',
            `Start response debug_port=${startResult.debug_port || 'empty'} websocket_link=${startResult.websocket_link ? 'present' : 'empty'}`,
          ),
        );
        if (startResult.debug_port) {
          const debugProbe = await this.probeDebugPortEndpoint(
            context.runtimeSnapshot.browserHost,
            startResult.debug_port,
          );
          this.logger.log({
            message: 'Debug port probe after start completed',
            correlationId: context.correlationId,
            profileRecordId: context.profile.id,
            profileId: context.profile.profileId,
            debugPort: startResult.debug_port,
            probe: debugProbe,
          });
          steps.push(
            this.createStep(
              'auto_start_debug_port_probed',
              `Debug port ${startResult.debug_port} probe ok=${debugProbe.ok} websocket=${debugProbe.webSocketDebuggerUrl ? 'present' : 'empty'} status=${debugProbe.httpStatus}`,
            ),
          );
        }
        context = await this.buildContext(jobItemId, payload);
        this.validateContext(context);
        steps.push(
          this.createStep(
            'auto_start_completed',
            `Profile start returned debug_port=${startResult.debug_port || 'empty'} websocket_link=${startResult.websocket_link ? 'present' : 'empty'} chrome_flags=${ProfileActionsOrchestratorService.AVITO_HEADLESS_CHROME_FLAGS}`,
          ),
        );
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
    const connection = await this.undetectableApiService.getConnectionSettings();
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
        browserHost: connection.host,
        debugPort: item.profile.debugPort,
        websocketLink: this.normalizeWebsocketLink(item.profile.websocketLink, connection.host),
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

    if (
      (context.action.action === 'top_up_wallet' ||
        context.action.action === 'disable_ads' ||
        context.action.action === 'withdraw') &&
      !(Number.isInteger(context.action.amount) && context.action.amount > 0)
    ) {
      throw new ActionExecutionError(
        'Action amount must be a positive integer',
        this.buildFailureResult(
          context.action.action,
          new Date(),
          'Action amount must be a positive integer',
          'INVALID_ACTION_AMOUNT',
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
      const freshContext = await this.buildContext(context.jobItem.id, context.action);

      if (freshContext.runtimeSnapshot.websocketLink) {
        try {
          return await this.checkBrowserConnection(freshContext);
        } catch (error) {
          lastReason = error instanceof Error ? error.message : 'Unknown browser readiness error';
          this.logger.warn({
            message: 'Browser websocket exists but is not ready yet',
            correlationId: context.correlationId,
            profileRecordId: context.profile.id,
            profileId: context.profile.profileId,
            status: freshContext.runtimeSnapshot.status,
            websocketLinkPresent: true,
            reason: lastReason,
          });
          await this.sleep(ProfileActionsOrchestratorService.PROFILE_READY_POLL_MS);
          continue;
        }
      }

      if (freshContext.runtimeSnapshot.debugPort) {
        try {
          const debugProbe = await this.probeDebugPortEndpoint(
            freshContext.runtimeSnapshot.browserHost,
            freshContext.runtimeSnapshot.debugPort,
          );
          const websocketLink = debugProbe.webSocketDebuggerUrl;
          if (websocketLink) {
            await this.prisma.undetectableProfile.update({
              where: { id: context.profile.id },
              data: {
                status: ProfileLifecycleStatus.STARTED,
                websocketLink,
                lastSeenAt: new Date(),
                isMissing: false,
              },
            });

            this.logger.log({
              message: 'Resolved websocket from debug port',
              correlationId: context.correlationId,
              profileRecordId: context.profile.id,
              profileId: context.profile.profileId,
              debugPort: freshContext.runtimeSnapshot.debugPort,
              probe: debugProbe,
            });
            await this.sleep(ProfileActionsOrchestratorService.PROFILE_READY_POLL_MS);
            continue;
          }

          lastReason = `Debug port ${freshContext.runtimeSnapshot.debugPort} is reachable but webSocketDebuggerUrl is empty`;
          this.logger.warn({
            message: 'Debug port responded without webSocketDebuggerUrl',
            correlationId: context.correlationId,
            profileRecordId: context.profile.id,
            profileId: context.profile.profileId,
            debugPort: freshContext.runtimeSnapshot.debugPort,
            probe: debugProbe,
            reason: lastReason,
          });
        } catch (error) {
          lastReason =
            error instanceof Error ? error.message : 'Failed to resolve websocket from debug port';
          this.logger.warn({
            message: 'Debug port is present but websocket endpoint is unresolved',
            correlationId: context.correlationId,
            profileRecordId: context.profile.id,
            profileId: context.profile.profileId,
            debugPort: freshContext.runtimeSnapshot.debugPort,
            reason: lastReason,
          });
        }
      }

      const refreshed = await this.profilesService.refreshRuntimeSnapshot(context.profile.id);
      if (!refreshed.websocketLink) {
        lastReason = `Profile state is ${refreshed.status}, websocket pending`;
        this.logger.warn({
          message: 'Browser websocket is still pending',
          correlationId: context.correlationId,
          profileRecordId: context.profile.id,
          profileId: context.profile.profileId,
          status: refreshed.status,
          debugPort: refreshed.debugPort,
          websocketLinkPresent: false,
          reason: lastReason,
        });
      }

      await this.sleep(ProfileActionsOrchestratorService.PROFILE_READY_POLL_MS);
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

  private async persistStartProfileResult(
    profileRecordId: string,
    startResult: {
      name?: string;
      websocket_link?: string;
      debug_port?: string;
      folder?: string;
      tags?: string[];
    },
  ) {
    if (!startResult.websocket_link && !startResult.debug_port) {
      await this.profilesService.refreshRuntimeSnapshot(profileRecordId);
      return;
    }

    await this.prisma.undetectableProfile.update({
      where: { id: profileRecordId },
      data: {
        name: startResult.name?.trim() || undefined,
        status: ProfileLifecycleStatus.STARTED,
        folder: startResult.folder?.trim() || undefined,
        tags: startResult.tags ?? undefined,
        debugPort: startResult.debug_port || null,
        websocketLink: this.normalizeWebsocketLink(
          startResult.websocket_link || null,
          await this.undetectableApiService.getBrowserHost(),
        ),
        lastSeenAt: new Date(),
        isMissing: false,
      },
    });
  }

  private async checkBrowserConnection(context: ActionExecutionContext) {
    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw new Error(
        `Profile state is ${context.runtimeSnapshot.status}, websocket/debug port pending`,
      );
    }

    let browser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;
    try {
      browser = await this.connectToProfileBrowser(context);

      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());
      const readyState = await page.evaluate(() => document.readyState);

      return {
        pageCount: pages.length || 1,
        activePageUrl: page.url() || 'about:blank',
        readyState,
      };
    } catch (error) {
      throw new Error(this.formatUnknownError(error));
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  private async resolveWebsocketFromDebugPort(browserHost: string, debugPort: string) {
    const probe = await this.probeDebugPortEndpoint(browserHost, debugPort);
    return probe.webSocketDebuggerUrl;
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

  private formatUnknownError(error: unknown) {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean') {
      return String(error);
    }

    try {
      return inspect(error, { depth: 4, breakLength: 120 });
    } catch {
      return 'Unknown browser readiness error';
    }
  }

  private async connectToProfileBrowser(context: ActionExecutionContext) {
    if (context.runtimeSnapshot.debugPort) {
      return puppeteer.connect({
        browserURL: `http://${context.runtimeSnapshot.browserHost}:${context.runtimeSnapshot.debugPort}`,
        defaultViewport: null,
      });
    }

    if (context.runtimeSnapshot.websocketLink) {
      return puppeteer.connect({
        browserWSEndpoint: context.runtimeSnapshot.websocketLink,
        defaultViewport: null,
      });
    }

    throw new Error(
      `Profile state is ${context.runtimeSnapshot.status}, websocket/debug port pending`,
    );
  }

  private async probeDebugPortEndpoint(browserHost: string, debugPort: string) {
    let response: Response;
    try {
      response = await fetch(`http://${browserHost}:${debugPort}/json/version`);
    } catch (error) {
      throw new Error(
        `Debug port ${browserHost}:${debugPort} fetch failed: ${this.formatUnknownError(error)}`,
      );
    }

    const rawText = await response.text();
    let body: unknown = null;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = rawText;
      }
    }

    if (!response.ok) {
      throw new Error(
        `Debug port ${browserHost}:${debugPort} responded with HTTP ${response.status}: ${typeof body === 'string' ? body : inspect(body, { depth: 3, breakLength: 120 })}`,
      );
    }

    const payload =
      body && typeof body === 'object'
        ? (body as { webSocketDebuggerUrl?: unknown })
        : null;

    return {
      ok: response.ok,
      httpStatus: response.status,
      body,
      webSocketDebuggerUrl:
        payload && typeof payload.webSocketDebuggerUrl === 'string'
          ? this.normalizeWebsocketLink(payload.webSocketDebuggerUrl, browserHost)
          : null,
    };
  }

  private normalizeWebsocketLink(websocketLink: string | null, browserHost: string) {
    if (!websocketLink) {
      return null;
    }

    try {
      const parsed = new URL(websocketLink);
      parsed.hostname = browserHost;
      return parsed.toString();
    } catch {
      return websocketLink;
    }
  }
}
