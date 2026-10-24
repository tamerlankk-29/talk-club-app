import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { BroadcastsService } from './broadcasts.service';
import { AnnouncementsController, BroadcastsController } from './marketing.controller';

@Module({
  controllers: [AnnouncementsController, BroadcastsController],
  providers: [BroadcastsService, AnnouncementsService],
  exports: [BroadcastsService, AnnouncementsService],
})
export class MarketingModule {}
