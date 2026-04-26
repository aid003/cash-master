import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ProfilesModule } from '../profiles/profiles.module';
import { ProjectsModule } from '../projects/projects.module';
import { AvitoActionRunnerService } from './avito-action-runner.service';
import { JobsController } from './jobs.controller';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from './jobs.service';
import { ProfileActionsOrchestratorService } from './profile-actions-orchestrator.service';
import { PROFILE_OPERATIONS_QUEUE } from './jobs.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PROFILE_OPERATIONS_QUEUE,
    }),
    ProjectsModule,
    forwardRef(() => ProfilesModule),
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsProcessor,
    AvitoActionRunnerService,
    ProfileActionsOrchestratorService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
