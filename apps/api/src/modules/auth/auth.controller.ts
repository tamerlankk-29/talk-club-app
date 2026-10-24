import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { OkResponseDto } from '../../common/dto/pagination.dto';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AuthService, IssuedSession } from './auth.service';
import {
  AuthTokensDto,
  ChangePasswordDto,
  LoginDto,
  OtpChannelsDto,
  OtpRequestedDto,
  RefreshDto,
  RegisterDto,
  RequestOtpDto,
  ResetPasswordDto,
  ResetPasswordRequestDto,
  SessionUserDto,
  VerifyOtpDto,
  VerifyOtpResponseDto,
} from './dto/auth.dto';

export const REFRESH_COOKIE = 'tc_rt';
/**
 * Non-secret companion of the refresh cookie, readable by the web app, so a
 * signed-out browser doesn't call /auth/refresh on every page load.
 */
export const SESSION_HINT_COOKIE = 'tc_session';

const platformHeader = ApiHeader({
  name: 'X-Client-Platform',
  required: false,
  description: '"native" for mobile apps: the refresh token is returned in the body instead of an httpOnly cookie',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a 6-digit code by SMS or Telegram for sign-in / registration' })
  requestOtp(@Body() dto: RequestOtpDto): Promise<OtpRequestedDto> {
    return this.auth.requestLoginCode(dto.phone, dto.channel);
  }

  @Public()
  @Get('otp/channels')
  @ApiOperation({ summary: 'Which channels can deliver sign-in codes (SMS, Telegram)' })
  otpChannels(): OtpChannelsDto {
    return this.auth.otpChannels();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  @platformHeader
  @ApiOperation({ summary: 'Verify the SMS code: signs in, or returns a registration token for new numbers' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyOtpResponseDto> {
    const result = await this.auth.verifyLoginCode(dto.phone, dto.code);
    if (result.status === 'REGISTRATION_REQUIRED') return result;
    return { status: 'AUTHENTICATED', auth: this.respond(result.session, req, res) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @platformHeader
  @ApiOperation({ summary: 'Create a client account after phone verification' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.respond(await this.auth.register(dto), req, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @platformHeader
  @ApiOperation({ summary: 'Sign in with email or phone + password (clients and staff)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.respond(await this.auth.loginWithPassword(dto.login, dto.password), req, res);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @platformHeader
  @ApiOperation({ summary: 'Exchange the refresh token (cookie or body) for a new access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    const token = this.readRefreshToken(req, dto);
    if (!token) {
      this.clearCookies(res);
      throw new DomainError('AUTH_REFRESH_INVALID');
    }
    try {
      return this.respond(await this.auth.refresh(token), req, res);
    } catch (error) {
      this.clearCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser | null,
  ): Promise<OkResponseDto> {
    await this.auth.logout(this.readRefreshToken(req, dto, false), user?.sessionId ?? null);
    this.clearCookies(res);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a password reset code by SMS or Telegram' })
  requestReset(@Body() dto: ResetPasswordRequestDto): Promise<OtpRequestedDto> {
    return this.auth.requestPasswordReset(dto.phone, dto.channel);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  @platformHeader
  @ApiOperation({ summary: 'Set a new password with the SMS code (signs out other devices)' })
  async reset(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.respond(await this.auth.resetPassword(dto.phone, dto.code, dto.newPassword), req, res);
  }

  @Post('password/change')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change or set the password of the signed-in user' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<OkResponseDto> {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, roles, permissions and available areas' })
  session(@CurrentUser() user: AuthUser): Promise<SessionUserDto> {
    return this.auth.sessionUser(user.id, user.sessionId);
  }

  // ─── helpers ───

  private isNative(req: Request): boolean {
    return (req.header('x-client-platform') ?? '').toLowerCase() === 'native';
  }

  private readRefreshToken(req: Request, dto: RefreshDto, enforceOrigin = true): string | null {
    if (this.isNative(req)) return dto.refreshToken ?? null;
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? null;
    if (token && enforceOrigin) this.assertTrustedOrigin(req);
    return token;
  }

  /** CSRF defence in depth for the cookie-authenticated endpoints (the cookie is also SameSite=Strict). */
  private assertTrustedOrigin(req: Request): void {
    const origin = req.header('origin');
    if (!origin) return;
    if (!this.config.corsOrigins.includes(origin) && origin !== this.config.appUrl) {
      throw new DomainError('FORBIDDEN', { message: 'Untrusted origin.' });
    }
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'strict',
      path: '/api/auth',
    };
  }

  private respond(session: IssuedSession, req: Request, res: Response): AuthTokensDto {
    const body: AuthTokensDto = { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
    if (this.isNative(req)) {
      body.refreshToken = session.refreshToken;
    } else {
      res.cookie(REFRESH_COOKIE, session.refreshToken, {
        ...this.cookieOptions(),
        expires: session.refreshExpiresAt,
      });
      res.cookie(SESSION_HINT_COOKIE, '1', { ...this.hintCookieOptions(), expires: session.refreshExpiresAt });
    }
    return body;
  }

  private hintCookieOptions(): CookieOptions {
    return { httpOnly: false, secure: this.config.auth.cookieSecure, sameSite: 'strict', path: '/' };
  }

  private clearCookies(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    res.clearCookie(SESSION_HINT_COOKIE, this.hintCookieOptions());
  }
}
