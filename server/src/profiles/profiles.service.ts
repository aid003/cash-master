import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileLifecycleStatus } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { UndetectableApiService } from './undetectable-api.service';

const mapRemoteStatus = (value?: string): ProfileLifecycleStatus => {
  switch (value) {
    case 'Available':
      return ProfileLifecycleStatus.AVAILABLE;
    case 'Started':
      return ProfileLifecycleStatus.STARTED;
    case 'Locked':
      return ProfileLifecycleStatus.LOCKED;
    default:
      return ProfileLifecycleStatus.UNKNOWN;
  }
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly undetectableApiService: UndetectableApiService,
  ) {}

  list() {
    return this.prisma.undetectableProfile.findMany({
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [{ isMissing: 'asc' }, { name: 'asc' }],
    });
  }

  async syncProfiles() {
    await this.undetectableApiService.getStatus();
    const remoteProfiles = await this.undetectableApiService.listProfiles();
    const seenProfileIds = Object.keys(remoteProfiles);
    const now = new Date();

    for (const [profileId, profile] of Object.entries(remoteProfiles)) {
      await this.prisma.undetectableProfile.upsert({
        where: { profileId },
        update: {
          name: profile.name?.trim() || profileId,
          status: mapRemoteStatus(profile.status),
          folder: profile.folder?.trim() || null,
          tags: profile.tags ?? [],
          debugPort: profile.debug_port || null,
          websocketLink: profile.websocket_link || null,
          lastSeenAt: now,
          isMissing: false,
        },
        create: {
          profileId,
          name: profile.name?.trim() || profileId,
          status: mapRemoteStatus(profile.status),
          folder: profile.folder?.trim() || null,
          tags: profile.tags ?? [],
          debugPort: profile.debug_port || null,
          websocketLink: profile.websocket_link || null,
          lastSeenAt: now,
          isMissing: false,
        },
      });
    }

    await this.prisma.undetectableProfile.updateMany({
      where: {
        ...(seenProfileIds.length > 0
          ? { profileId: { notIn: seenProfileIds } }
          : {}),
      },
      data: {
        isMissing: true,
        projectId: null,
        status: ProfileLifecycleStatus.MISSING,
        debugPort: null,
        websocketLink: null,
      },
    });

    return this.list();
  }

  async assignProfile(profileRecordId: string, projectId: string) {
    await this.projectsService.ensureExists(projectId);
    const profile = await this.getProfileOrThrow(profileRecordId);

    if (profile.isMissing) {
      throw new ConflictException('Missing profile cannot be assigned');
    }

    if (profile.projectId && profile.projectId !== projectId) {
      throw new ConflictException('Profile is already assigned to another project');
    }

    return this.prisma.undetectableProfile.update({
      where: { id: profileRecordId },
      data: { projectId },
      include: {
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  }

  async unassignProfile(profileRecordId: string) {
    await this.getProfileOrThrow(profileRecordId);

    return this.prisma.undetectableProfile.update({
      where: { id: profileRecordId },
      data: { projectId: null },
      include: {
        project: {
          select: { id: true, name: true, status: true },
        },
      },
    });
  }

  async getProfileOrThrow(profileRecordId: string) {
    const profile = await this.prisma.undetectableProfile.findUnique({
      where: { id: profileRecordId },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async refreshRuntimeSnapshot(profileRecordId: string) {
    const profile = await this.getProfileOrThrow(profileRecordId);
    const remoteProfiles = await this.undetectableApiService.listProfiles();
    const remote = remoteProfiles[profile.profileId];

    if (!remote) {
      return this.prisma.undetectableProfile.update({
        where: { id: profileRecordId },
        data: {
          isMissing: true,
          projectId: null,
          status: ProfileLifecycleStatus.MISSING,
          debugPort: null,
          websocketLink: null,
        },
      });
    }

    return this.prisma.undetectableProfile.update({
      where: { id: profileRecordId },
      data: {
        name: remote.name?.trim() || profile.name,
        status: mapRemoteStatus(remote.status),
        folder: remote.folder?.trim() || null,
        tags: remote.tags ?? [],
        debugPort: remote.debug_port || null,
        websocketLink: remote.websocket_link || null,
        lastSeenAt: new Date(),
        isMissing: false,
      },
    });
  }
}
