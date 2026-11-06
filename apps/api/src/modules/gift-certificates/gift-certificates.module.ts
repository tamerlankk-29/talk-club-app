import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminGiftCertificatesController, MyGiftCertificatesController } from './gift-certificates.controller';
import { GiftCertificatesService } from './gift-certificates.service';

@Module({
  imports: [PaymentsModule, MembershipsModule],
  controllers: [AdminGiftCertificatesController, MyGiftCertificatesController],
  providers: [GiftCertificatesService],
})
export class GiftCertificatesModule {}
