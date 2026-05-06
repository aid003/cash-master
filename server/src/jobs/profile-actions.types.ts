import type {
  Job,
  JobItem,
  ProfileLifecycleStatus,
  Project,
  UndetectableProfile,
} from '@prisma/client';

export const profileActionTypes = [
  'start',
  'stop',
  'disable_ads',
  'withdraw',
  'launch_ads',
  'top_up_wallet',
] as const;

export type ProfileActionType = (typeof profileActionTypes)[number];

export type ActionStep = {
  code: string;
  message: string;
  timestamp: string;
};

type BaseActionPayload = {
  action: ProfileActionType;
  requestedByUserId: string;
  requestedAt: string;
  projectId: string | null;
  profileRecordId: string;
};

export type TopUpWalletPayload = BaseActionPayload & {
  action: 'top_up_wallet';
  amount: number;
  currency: 'RUB';
};

export type RefundActionPayload = BaseActionPayload & {
  action: 'disable_ads' | 'withdraw';
  amount: number;
  currency: 'RUB';
};

export type LaunchAdsPayload = BaseActionPayload & {
  action: 'launch_ads';
  amount: number;
  currency: 'RUB';
};

export type BasicActionPayload = BaseActionPayload & {
  action: Exclude<ProfileActionType, 'disable_ads' | 'withdraw' | 'launch_ads' | 'top_up_wallet'>;
};

export type AvitoActionPayload =
  | BasicActionPayload
  | RefundActionPayload
  | LaunchAdsPayload
  | TopUpWalletPayload;

export type ActionExecutionProfile = UndetectableProfile & {
  project: Pick<Project, 'id' | 'name' | 'status'> | null;
};

export type ActionExecutionContext = {
  job: Pick<Job, 'id' | 'projectId' | 'title' | 'type'>;
  jobItem: Pick<JobItem, 'id' | 'profileId'>;
  correlationId: string;
  userId: string;
  profile: ActionExecutionProfile;
  runtimeSnapshot: {
    status: ProfileLifecycleStatus;
    browserHost: string;
    debugPort: string | null;
    websocketLink: string | null;
    isMissing: boolean;
    lastSeenAt: string | null;
  };
  action: AvitoActionPayload;
};

export type AvitoActionResult = {
  action: ProfileActionType;
  outcomeCode: string;
  message: string;
  startedAt: string;
  finishedAt: string;
  runnerMode: 'stub' | 'undetectable';
  rawResult: unknown;
  rawError: unknown;
  steps?: ActionStep[];
};

export type RunnerExecutionResult = {
  outcomeCode: string;
  message: string;
  runnerMode: 'stub' | 'undetectable';
  rawResult: unknown;
  steps?: ActionStep[];
};

export interface AvitoActionRunner {
  executeWithdraw(context: ActionExecutionContext): Promise<RunnerExecutionResult>;
  executeLaunchAds(context: ActionExecutionContext): Promise<RunnerExecutionResult>;
  executeTopUpWallet(context: ActionExecutionContext): Promise<RunnerExecutionResult>;
}

export class ActionExecutionError extends Error {
  constructor(
    message: string,
    readonly result: AvitoActionResult,
  ) {
    super(message);
  }
}
