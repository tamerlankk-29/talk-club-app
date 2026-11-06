import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientCategory, FormatPreference, TimeOfDay } from '@prisma/client';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RequestOtpDto {
  /** Phone number in any common format, e.g. +7 701 123 45 67 */
  @IsString()
  @MaxLength(32)
  phone: string;

  /** Where to send the code. Defaults to SMS when it is available, otherwise Telegram. */
  @ApiPropertyOptional({ enum: ['sms', 'telegram'] })
  @IsOptional()
  @IsIn(['sms', 'telegram'])
  channel?: 'sms' | 'telegram';

  /** Cloudflare Turnstile token, required after a few requests from one network (AUTH_CAPTCHA_REQUIRED). */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class OtpRequestedDto {
  @ApiProperty({ enum: ['sms', 'telegram'] })
  channel: 'sms' | 'telegram';
  expiresInSeconds: number;
  resendInSeconds: number;
  /** Development only (AUTH_OTP_DEV_ECHO=true): the code that was "sent". */
  devCode?: string;
}

export class OtpChannelsDto {
  /** Codes can be sent by SMS. */
  sms: boolean;
  /** Codes can be sent through the Talk Club Telegram bot. */
  telegram: boolean;
  /** Link that opens the bot, where members share their phone number once. */
  telegramBotUrl: string | null;
  /** Turnstile site key when a captcha may be asked for, else null. */
  captchaSiteKey: string | null;
}

export class VerifyOtpDto {
  @IsString()
  @MaxLength(32)
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class RegisterDto {
  /** Token returned by POST /auth/otp/verify for a new phone number */
  @IsString()
  @MaxLength(2000)
  registrationToken: string;

  @IsString()
  @Length(1, 60)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  /** Optional — lets the client also sign in with email/phone + password */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  /** yyyy-MM-dd */
  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional({ enum: ClientCategory, enumName: 'ClientCategory' })
  @IsOptional()
  @IsEnum(ClientCategory)
  category?: ClientCategory;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  /** ISO weekdays 1 (Mon) … 7 (Sun) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  preferredDays?: number[];

  @ApiPropertyOptional({ enum: TimeOfDay, enumName: 'TimeOfDay', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TimeOfDay, { each: true })
  preferredTimes?: TimeOfDay[];

  @ApiPropertyOptional({ enum: FormatPreference, enumName: 'FormatPreference' })
  @IsOptional()
  @IsEnum(FormatPreference)
  formatPreference?: FormatPreference;

  @IsBoolean()
  marketingConsent: boolean;

  /** Must be true: acceptance of the current Terms and Privacy Policy is recorded */
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms' })
  acceptTerms: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  referralCode?: string;

  /** Lead source code, e.g. INSTAGRAM, TIKTOK, REFERRAL */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceCode?: string;
}

export class LoginDto {
  /** Email address or phone number */
  @IsString()
  @MaxLength(120)
  login: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  /** Native apps only — web clients use the httpOnly refresh cookie */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class ResetPasswordRequestDto {
  @IsString()
  @MaxLength(32)
  phone: string;

  /** Where to send the code. Defaults to SMS when it is available, otherwise Telegram. */
  @ApiPropertyOptional({ enum: ['sms', 'telegram'] })
  @IsOptional()
  @IsIn(['sms', 'telegram'])
  channel?: 'sms' | 'telegram';
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(32)
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

// ─── Responses ───

export class SessionClientDto {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}

export class SessionTeacherDto {
  id: string;
  name: string;
  photoUrl: string | null;
}

export class SessionAreasDto {
  /** Can use the client app */
  client: boolean;
  /** Can open the admin panel */
  admin: boolean;
  /** Can open the teacher panel */
  teacher: boolean;
}

export class SessionUserDto {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
  roles: string[];
  permissions: string[];
  client: SessionClientDto | null;
  teacher: SessionTeacherDto | null;
  /** Child profiles managed by this user (send their id in X-Acting-Client) */
  managedClients: SessionClientDto[];
  areas: SessionAreasDto;
}

export class AuthTokensDto {
  accessToken: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  /** Returned only to native clients (header X-Client-Platform: native) */
  refreshToken?: string;
  user: SessionUserDto;
}

export class VerifyOtpResponseDto {
  @ApiProperty({ enum: ['AUTHENTICATED', 'REGISTRATION_REQUIRED'] })
  status: 'AUTHENTICATED' | 'REGISTRATION_REQUIRED';
  auth?: AuthTokensDto;
  /** For REGISTRATION_REQUIRED: pass to POST /auth/register within 30 minutes */
  registrationToken?: string;
  phone?: string;
}

export class PlatformHeaderDto {
  @IsOptional()
  @IsIn(['web', 'native'])
  platform?: 'web' | 'native';
}
