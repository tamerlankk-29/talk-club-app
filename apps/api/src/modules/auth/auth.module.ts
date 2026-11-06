import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { LegalModule } from '../legal/legal.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AuthContextService } from './auth-context.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.auth.secret,
        signOptions: { issuer: 'talkclub', algorithm: 'HS256' },
        verifyOptions: { issuer: 'talkclub', algorithms: ['HS256'] },
      }),
    }),
    LegalModule,
    ReferralsModule,
    TelegramModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, OtpService, AuthContextService],
  exports: [AuthService, TokenService, AuthContextService],
})
export class AuthModule {}
