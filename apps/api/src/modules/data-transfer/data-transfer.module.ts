import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';

@Module({
  imports: [ReportsModule],
  controllers: [DataTransferController],
  providers: [DataTransferService],
})
export class DataTransferModule {}
