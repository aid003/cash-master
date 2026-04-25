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
import { JobsService } from '../jobs/jobs.service';
import { AssignProfileDto } from './dto/assign-profile.dto';
import { ProfilesService } from './profiles.service';

@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly jobsService: JobsService,
  ) {}

  @Get()
  list() {
    return this.profilesService.list();
  }

  @Post('revision')
  revision() {
    return this.profilesService.syncProfiles();
  }

  @Post(':profileRecordId/assign')
  assign(
    @Param('profileRecordId') profileRecordId: string,
    @Body() dto: AssignProfileDto,
  ) {
    return this.profilesService.assignProfile(profileRecordId, dto.projectId);
  }

  @Post(':profileRecordId/unassign')
  unassign(@Param('profileRecordId') profileRecordId: string) {
    return this.profilesService.unassignProfile(profileRecordId);
  }

  @Post(':profileRecordId/start')
  start(
    @Param('profileRecordId') profileRecordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(profileRecordId, 'start', user.id);
  }

  @Post(':profileRecordId/stop')
  stop(
    @Param('profileRecordId') profileRecordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(profileRecordId, 'stop', user.id);
  }
}
