import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleProvider } from './google.provider';
import { SessionGuard } from './session.guard';
import { AuthRateGuard } from './auth-rate.guard';
import { LoginDto, RegisterDto } from './auth.dto';
import { tokensEqual } from './auth.crypto';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  STATE_MAX_AGE,
  type AuthRequest,
} from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleProvider,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
  private loginError(response: Response, reason: string) {
    return response.redirect(
      this.config.getOrThrow<string>('WEB_ORIGIN') + '/login?error=' + reason,
    );
  }
  private assertOrigin(request: Request) {
    if (request.get('origin') !== this.config.getOrThrow<string>('WEB_ORIGIN'))
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Nguồn yêu cầu không hợp lệ.',
      });
  }
  private previousToken(request: Request): string | undefined {
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    return typeof token === 'string' ? token : undefined;
  }
  private setSession(response: Response, session: { token: string; expiresAt: Date }) {
    response.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
  }

  @Get('config')
  @Header('Cache-Control', 'no-store')
  settings() {
    return { googleEnabled: this.google.enabled };
  }

  @Post('register')
  @UseGuards(AuthRateGuard)
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    const session = await this.auth.register(dto, this.previousToken(request));
    this.setSession(response, session);
    return this.auth.current(session.token);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthRateGuard)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertOrigin(request);
    const session = await this.auth.login(dto, this.previousToken(request));
    this.setSession(response, session);
    return this.auth.current(session.token);
  }

  @Get('google')
  @UseGuards(AuthRateGuard)
  @Header('Cache-Control', 'no-store')
  async begin(@Res() response: Response) {
    if (!this.google.enabled) return this.loginError(response, 'not_configured');
    try {
      const { state, url } = await this.auth.begin();
      response.cookie(STATE_COOKIE, state, {
        ...this.cookieOptions(),
        maxAge: STATE_MAX_AGE,
      });
      return response.redirect(url);
    } catch {
      return this.loginError(response, 'unavailable');
    }
  }

  @Get('google/callback')
  @Header('Cache-Control', 'no-store')
  async callback(@Req() request: Request, @Res() response: Response) {
    response.clearCookie(STATE_COOKIE, this.cookieOptions());
    const state = request.query.state;
    if (
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !tokensEqual(state, request.cookies?.[STATE_COOKIE])
    )
      return this.loginError(response, 'invalid_state');
    let verifier: string;
    try {
      verifier = await this.auth.consumeAttempt(state);
    } catch {
      return this.loginError(response, 'invalid_state');
    }
    if (request.query.error === 'access_denied')
      return this.loginError(response, 'cancelled');
    if (
      request.query.error ||
      typeof request.query.code !== 'string' ||
      request.query.code.length > 4096
    )
      return this.loginError(response, 'provider_error');
    try {
      const profile = await this.google.profile(request.query.code, verifier, state);
      const session = await this.auth.signInGoogle(profile, this.previousToken(request));
      this.setSession(response, session);
      return response.redirect(
        this.config.getOrThrow<string>('WEB_ORIGIN') + '/dashboard',
      );
    } catch (error) {
      return this.loginError(
        response,
        error instanceof ConflictException ? 'account_exists' : 'provider_error',
      );
    }
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest) {
    return request.auth;
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.sessionHash);
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }
}
