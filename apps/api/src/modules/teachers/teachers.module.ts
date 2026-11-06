import { Module } from '@nestjs/common';
import { AdminTeachersController, PublicTeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  controllers: [PublicTeachersController, AdminTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
