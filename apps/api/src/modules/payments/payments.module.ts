import { Module } from '@nestjs/common';
import { LegalModule } from '../legal/legal.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

@Module({
  imports: [MembershipsModule, LegalModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, PaymentProviderRegistry],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
