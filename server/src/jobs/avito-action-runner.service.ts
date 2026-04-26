import { Injectable } from '@nestjs/common';

import type {
  ActionExecutionContext,
  AvitoActionRunner,
  RunnerExecutionResult,
} from './profile-actions.types';

@Injectable()
export class AvitoActionRunnerService implements AvitoActionRunner {
  async executeWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    return this.buildStubResult(
      context,
      'WITHDRAW_STUB',
      'Withdraw flow is prepared but browser automation is not implemented yet.',
    );
  }

  async executeLaunchAds(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    return this.buildStubResult(
      context,
      'LAUNCH_ADS_STUB',
      'Launch ads flow is prepared but browser automation is not implemented yet.',
    );
  }

  async executeTopUpWallet(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    return this.buildStubResult(
      context,
      'TOP_UP_WALLET_STUB',
      `Top up wallet flow is prepared for ${context.action.action === 'top_up_wallet' ? context.action.amount : 0} RUB but browser automation is not implemented yet.`,
    );
  }

  private buildStubResult(
    context: ActionExecutionContext,
    outcomeCode: string,
    message: string,
  ): RunnerExecutionResult {
    return {
      outcomeCode,
      message,
      runnerMode: 'stub',
      rawResult: {
        stub: true,
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amount: context.action.action === 'top_up_wallet' ? context.action.amount : null,
        currency:
          context.action.action === 'top_up_wallet' ? context.action.currency : null,
      },
    };
  }
}
