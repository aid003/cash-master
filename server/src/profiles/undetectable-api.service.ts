import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppConfig } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../database/prisma.service';

type UndetectableEnvelope<T> = {
  code: number;
  status: string;
  data: T;
};

type RemoteProfile = {
  name?: string;
  status?: string;
  debug_port?: string;
  websocket_link?: string;
  folder?: string;
  tags?: string[];
};

type StartProfileResponse = {
  name?: string;
  websocket_link?: string;
  debug_port?: string;
  folder?: string;
  tags?: string[];
};

type UndetectableConnection = {
  protocol: 'http' | 'https';
  host: string;
  port: number;
  baseUrl: string;
  source: 'db' | 'env';
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckError: string | null;
  lastProfileCount: number | null;
};

type ConnectionInput = {
  protocol: 'http' | 'https';
  host: string;
  port: number;
};

const APP_CONFIG_ID = 1;

@Injectable()
export class UndetectableApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(): Promise<void> {
    await this.request<Record<string, never>>('/status');
  }

  async listProfiles(): Promise<Record<string, RemoteProfile>> {
    return this.request<Record<string, RemoteProfile>>('/list');
  }

  async startProfile(profileId: string): Promise<StartProfileResponse> {
    return this.request<StartProfileResponse>(`/profile/start/${profileId}`);
  }

  async stopProfile(profileId: string): Promise<Record<string, never>> {
    return this.request<Record<string, never>>(`/profile/stop/${profileId}`);
  }

  async getConnectionSettings(): Promise<UndetectableConnection> {
    return this.resolveConnection();
  }

  async testConnection(input: ConnectionInput) {
    const connection = this.createConnection(input.protocol, input.host, input.port, 'db', null);
    await this.requestToConnection<Record<string, never>>('/status', connection, false);
    const profiles = await this.requestToConnection<Record<string, RemoteProfile>>(
      '/list',
      connection,
      false,
    );

    return {
      ...connection,
      reachable: true,
      profileCount: Object.keys(profiles).length,
    };
  }

  async saveConnectionSettings(input: ConnectionInput) {
    const result = await this.testConnection(input);

    await this.prisma.appConfig.upsert({
      where: { id: APP_CONFIG_ID },
      update: {
        undetectableApiProtocol: result.protocol,
        undetectableApiHost: result.host,
        undetectableApiPort: result.port,
        undetectableLastCheckedAt: new Date(),
        undetectableLastCheckOk: true,
        undetectableLastCheckError: null,
        undetectableLastProfileCount: result.profileCount,
      },
      create: {
        id: APP_CONFIG_ID,
        undetectableApiProtocol: result.protocol,
        undetectableApiHost: result.host,
        undetectableApiPort: result.port,
        undetectableLastCheckedAt: new Date(),
        undetectableLastCheckOk: true,
        undetectableLastCheckError: null,
        undetectableLastProfileCount: result.profileCount,
      },
    });

    return this.getConnectionSettings();
  }

  private async request<T>(path: string): Promise<T> {
    const connection = await this.resolveConnection();
    return this.requestToConnection<T>(path, connection, true);
  }

  private async requestToConnection<T>(
    path: string,
    connection: UndetectableConnection,
    persistFailure: boolean,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${connection.baseUrl}${path}`);
    } catch (error) {
      if (persistFailure && connection.source === 'db') {
        await this.storeConnectionCheckResult(connection, false, 0, this.formatFetchError(error));
      }

      throw new ServiceUnavailableException(
        `Undetectable API is unavailable at ${connection.baseUrl}${path}: ${this.formatFetchError(error)}. Open Undetectable settings and verify protocol/host/port.`,
      );
    }

    if (!response.ok) {
      if (persistFailure && connection.source === 'db') {
        await this.storeConnectionCheckResult(
          connection,
          false,
          0,
          `HTTP ${response.status}`,
        );
      }

      throw new BadGatewayException(
        `Undetectable API request failed at ${connection.baseUrl}${path} with ${response.status}. Open Undetectable settings and verify protocol/host/port.`,
      );
    }

    const payload = (await response.json()) as UndetectableEnvelope<T>;
    if (payload.code !== 0 || payload.status !== 'success') {
      const message =
        typeof payload.data === 'object' &&
        payload.data !== null &&
        'error' in payload.data &&
        typeof payload.data.error === 'string'
          ? payload.data.error
          : 'Unknown Undetectable API error';

      if (persistFailure && connection.source === 'db') {
        await this.storeConnectionCheckResult(connection, false, 0, message);
      }

      throw new BadGatewayException(
        `Undetectable API error at ${connection.baseUrl}${path}: ${message}. Open Undetectable settings and verify protocol/host/port.`,
      );
    }

    if (persistFailure && connection.source === 'db' && path === '/list') {
      const profileCount =
        typeof payload.data === 'object' && payload.data !== null
          ? Object.keys(payload.data as Record<string, unknown>).length
          : 0;
      await this.storeConnectionCheckResult(connection, true, profileCount, null);
    } else if (persistFailure && connection.source === 'db' && path === '/status') {
      await this.storeConnectionCheckResult(connection, true, 0, null);
    }

    return payload.data;
  }

  private async resolveConnection(): Promise<UndetectableConnection> {
    const appConfig = await this.prisma.appConfig.findUnique({
      where: { id: APP_CONFIG_ID },
    });

    if (appConfig?.undetectableApiHost && appConfig.undetectableApiPort) {
      return this.createConnection(
        appConfig.undetectableApiProtocol === 'https' ? 'https' : 'http',
        appConfig.undetectableApiHost,
        appConfig.undetectableApiPort,
        'db',
        appConfig,
      );
    }

    const fallbackUrl = this.configService.get<string>(
      'UNDETECTABLE_API_BASE_URL',
      'http://127.0.0.1:25325',
    );

    const parsed = new URL(fallbackUrl);
    return this.createConnection(
      parsed.protocol === 'https:' ? 'https' : 'http',
      parsed.hostname,
      Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
      'env',
      appConfig,
    );
  }

  private createConnection(
    protocol: 'http' | 'https',
    host: string,
    port: number,
    source: 'db' | 'env',
    appConfig: AppConfig | null,
  ): UndetectableConnection {
    return {
      protocol,
      host: host.trim(),
      port,
      baseUrl: `${protocol}://${host.trim()}:${port}`,
      source,
      lastCheckedAt: appConfig?.undetectableLastCheckedAt?.toISOString() ?? null,
      lastCheckOk: appConfig?.undetectableLastCheckOk ?? null,
      lastCheckError: appConfig?.undetectableLastCheckError ?? null,
      lastProfileCount: appConfig?.undetectableLastProfileCount ?? null,
    };
  }

  private async storeConnectionCheckResult(
    connection: UndetectableConnection,
    ok: boolean,
    profileCount: number,
    error: string | null,
  ) {
    await this.prisma.appConfig.upsert({
      where: { id: APP_CONFIG_ID },
      update: {
        undetectableApiProtocol: connection.protocol,
        undetectableApiHost: connection.host,
        undetectableApiPort: connection.port,
        undetectableLastCheckedAt: new Date(),
        undetectableLastCheckOk: ok,
        undetectableLastCheckError: error,
        undetectableLastProfileCount: ok ? profileCount : null,
      },
      create: {
        id: APP_CONFIG_ID,
        undetectableApiProtocol: connection.protocol,
        undetectableApiHost: connection.host,
        undetectableApiPort: connection.port,
        undetectableLastCheckedAt: new Date(),
        undetectableLastCheckOk: ok,
        undetectableLastCheckError: error,
        undetectableLastProfileCount: ok ? profileCount : null,
      },
    });
  }

  private formatFetchError(error: unknown) {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
