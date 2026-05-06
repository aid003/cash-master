import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ExecuteProjectActionDto } from './dto/execute-project-action.dto';
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

  @Post('projects/:projectId/withdraw')
  withdrawProject(
    @Param('projectId') projectId: string,
    @Body() dto: ExecuteProjectActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'withdraw', user.id, dto);
  }

  @Post('projects/:projectId/disable-ads')
  disableAdsProject(
    @Param('projectId') projectId: string,
    @Body() dto: ExecuteProjectActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'disable_ads', user.id, dto);
  }

  @Post('projects/:projectId/launch-ads')
  launchAdsProject(
    @Param('projectId') projectId: string,
    @Body() dto: ExecuteProjectActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'launch_ads', user.id, dto);
  }

  @Post('projects/:projectId/top-up-wallet')
  topUpWalletProject(
    @Param('projectId') projectId: string,
    @Body() dto: ExecuteProjectActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createProjectJob(projectId, 'top_up_wallet', user.id, dto);
  }
}
