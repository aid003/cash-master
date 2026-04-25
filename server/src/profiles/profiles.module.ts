import { Module, forwardRef } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { UndetectableApiService } from './undetectable-api.service';

@Module({
  imports: [ProjectsModule, forwardRef(() => JobsModule)],
  controllers: [ProfilesController],
  providers: [ProfilesService, UndetectableApiService],
  exports: [ProfilesService, UndetectableApiService],
})
export class ProfilesModule {}
