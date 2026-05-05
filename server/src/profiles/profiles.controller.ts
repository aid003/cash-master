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
import { ExecuteProfileActionDto } from '../jobs/dto/execute-profile-action.dto';
import { JobsService } from '../jobs/jobs.service';
import { AssignProfileDto } from './dto/assign-profile.dto';
import { UndetectableConnectionSettingsDto } from './dto/undetectable-connection-settings.dto';
import { ProfilesService } from './profiles.service';
import { UndetectableApiService } from './undetectable-api.service';

@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly jobsService: JobsService,
    private readonly undetectableApiService: UndetectableApiService,
  ) {}

  @Get()
  list() {
    return this.profilesService.list();
  }

  @Get('connection-settings')
  getConnectionSettings() {
    return this.undetectableApiService.getConnectionSettings();
  }

  @Post('connection-settings/test')
  testConnectionSettings(@Body() dto: UndetectableConnectionSettingsDto) {
    return this.undetectableApiService.testConnection(dto);
  }

  @Post('connection-settings')
  saveConnectionSettings(@Body() dto: UndetectableConnectionSettingsDto) {
    return this.undetectableApiService.saveConnectionSettings(dto);
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

  @Post(':profileRecordId/withdraw')
  withdraw(
    @Param('profileRecordId') profileRecordId: string,
    @Body() dto: ExecuteProfileActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(profileRecordId, 'withdraw', user.id, dto);
  }

  @Post(':profileRecordId/disable-ads')
  disableAds(
    @Param('profileRecordId') profileRecordId: string,
    @Body() dto: ExecuteProfileActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(profileRecordId, 'disable_ads', user.id, dto);
  }

  @Post(':profileRecordId/launch-ads')
  launchAds(
    @Param('profileRecordId') profileRecordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(profileRecordId, 'launch_ads', user.id);
  }

  @Post(':profileRecordId/top-up-wallet')
  topUpWallet(
    @Param('profileRecordId') profileRecordId: string,
    @Body() dto: ExecuteProfileActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobsService.createSingleProfileJob(
      profileRecordId,
      'top_up_wallet',
      user.id,
      dto,
    );
  }
}
