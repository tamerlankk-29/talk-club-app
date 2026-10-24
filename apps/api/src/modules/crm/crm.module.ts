import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { PipelineService } from './pipeline.service';

@Global()
@Module({
  controllers: [CrmController],
  providers: [CrmService, PipelineService],
  exports: [CrmService, PipelineService],
})
export class CrmModule {}
