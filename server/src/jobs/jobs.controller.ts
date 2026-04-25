import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { JobsService } from './jobs.service';

@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list() {
    return this.jobsService.listJobs();
  }

  @Get(':jobId')
  getById(@Param('jobId') jobId: string) {
    return this.jobsService.getJob(jobId);
  }

  @Post('projects/:projectId/start')
  startProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'start', user.id);
  }

  @Post('projects/:projectId/stop')
  stopProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'stop', user.id);
  }
}
