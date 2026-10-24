import { Global, Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { ClientStatsService } from './client-stats.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Global()
@Module({
  imports: [MembershipsModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientStatsService],
  exports: [ClientsService, ClientStatsService],
})
export class ClientsModule {}
