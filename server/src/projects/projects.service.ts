import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const toProjectStatus = (value: 'active' | 'paused' | 'archived'): ProjectStatus =>
  ({
    active: ProjectStatus.ACTIVE,
    paused: ProjectStatus.PAUSED,
    archived: ProjectStatus.ARCHIVED,
  })[value];

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({
      include: {
        profiles: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            profiles: true,
            jobs: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getById(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        profiles: {
          orderBy: { name: 'asc' },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            items: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  create(dto: CreateProjectDto, userId: string) {
    return this.prisma.project.create({
      data: {
        name: dto.name.trim(),
        description: dto.description.trim(),
        status: toProjectStatus(dto.status),
        notes: dto.notes?.trim() ?? '',
        createdByUserId: userId,
      },
    });
  }

  async update(projectId: string, dto: UpdateProjectDto) {
    await this.ensureExists(projectId);

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.status !== undefined ? { status: toProjectStatus(dto.status) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
      },
    });
  }

  async ensureExists(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
