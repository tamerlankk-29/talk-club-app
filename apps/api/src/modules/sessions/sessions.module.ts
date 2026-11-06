import { Module } from '@nestjs/common';
import { SessionReadService } from './session-read.service';
import { AdminSessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [AdminSessionsController],
  providers: [SessionsService, SessionReadService],
  exports: [SessionsService, SessionReadService],
})
export class SessionsModule {}
