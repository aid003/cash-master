import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class UndetectableApiService {
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.get<string>(
      'UNDETECTABLE_API_BASE_URL',
      'http://127.0.0.1:25325',
    );
  }

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

  private async request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Undetectable API is unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(`Undetectable API request failed with ${response.status}`);
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

      throw new BadGatewayException(message);
    }

    return payload.data;
  }
}
