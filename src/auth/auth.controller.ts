import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { ApiSuccess } from 'src/common/types/api-response.type';
import { PublicUser } from 'src/common/types/public-user.type';
import { sha256Hex } from 'src/common/crypto/hash.util';
import { getClientIp } from 'src/common/auth/client-ip';
import { LoginDto } from './dto/login.dto';
import { LoginTelemetry } from 'src/common/types/login-telemetry.type';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserService } from 'src/user/user.service';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './guard/public.decorator';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { SkipCsrf } from './guard/skip-csrf.decorator';
import crypto from 'crypto';
import { GoogleUserPayload } from 'src/common/types/google-auth.type';
import { cookieBase } from 'src/common/cookies/cookie.util';
import { TurnstileGuard } from 'src/turnstile/turnstile.guard';
import { TurnstileAction } from 'src/turnstile/turnstile.decorator';

@Controller('auth')
export class AuthController {

  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) { }

  @UseGuards(TurnstileGuard)
  @TurnstileAction('register')
  @Public()
  @SkipCsrf()
  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() dto: SignupDto,
    @Req() req: Request,
  ): Promise<ApiSuccess<PublicUser>> {
    const userAgent = (req.headers['user-agent']?.toString() ?? '').slice(0, 200) || null;
    const referer = (req.headers['referer']?.toString() ?? '').slice(0, 200) || null;

    const deviceIdHeader =
      (req.headers['x-client-device-id'] as string | undefined) ??
      (req.headers['x-device-id'] as string | undefined);
    const deviceIdHash =
      deviceIdHeader && deviceIdHeader.length >= 8 && deviceIdHeader.length <= 128
        ? sha256Hex(deviceIdHeader)
        : null;

    const ip = getClientIp(req);
    const ipHash = ip ? sha256Hex(ip) : null;

    const user = await this.auth.signup(dto, {
      userAgent,
      referer,
      deviceIdHash,
      ipHash,
      submittedAtMs: Date.now(),
    });

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      code: 'USER_CREATED',
      message: 'Signup successful',
      data: user,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }
  @Public()
  @Post('login')
  @UseGuards(TurnstileGuard)
  @TurnstileAction('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,   // 👈 allow setting cookie
  ): Promise<ApiSuccess<{ tokenType: 'Bearer'; accessToken: string; expiresIn: number; user?: PublicUser }>> {

    const ip = getClientIp(req);
    const ua = (req.headers['user-agent']?.toString() ?? '').slice(0, 200);
    const deviceId =
      (req.headers['x-client-device-id'] as string | undefined) ??
      (req.headers['x-device-id'] as string | undefined);

    const telemetry: LoginTelemetry = {
      ip,
      userAgent: ua || null,
      deviceId: deviceId || null,
      deviceIdHash:
        deviceId && deviceId.length >= 8 && deviceId.length <= 128
          ? sha256Hex(deviceId)
          : null,
    };

    const { expiresIn, accessToken } = await this.auth.login(dto, telemetry);

    const base = cookieBase();

    // HttpOnly auth cookie (host-only, strict in prod)
    res.cookie('accessToken', accessToken, {
      ...base,
      httpOnly: true,
      maxAge: expiresIn * 1000,
    });

    // CSRF token (readable by JS, same attributes otherwise)
    const csrf = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', csrf, {
      ...base,
      httpOnly: false,
      maxAge: expiresIn * 1000,
    });
    return {
      success: true,
      statusCode: HttpStatus.OK,
      code: 'LOGIN_OK',
      message: 'Login successful',
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthRequest): Promise<ApiSuccess<PublicUser>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    // Important: return a plain object, not a Mongoose Document
    const user = await this.users.findById(uid);
    if (!user) throw new UnauthorizedException('USER_NOT_FOUND');


    // Build a plain payload — avoid spreading a Document
    const data: PublicUser = {
      _id: String(user._id),
      email: user.email,
      firstName: user?.firstName,
      lastName: user?.lastName,
      role: user?.role,
      emailVerified: false,
      photoURL: user.photoURL,
    };

    return {
      success: true,
      data,
      statusCode: HttpStatus.OK,
      code: "ME",
      message: 'Successful',
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }


  @Public()
  @SkipCsrf()
  @Get('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // passport triggers redirect, nothing to do here
  }

  @Public()
  @SkipCsrf()
  @Get('google/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // state was injected by GoogleStrategy.authorizationParams(req)

    // req.user comes from GoogleStrategy.validate()
    const { accessToken, expiresIn } =
      await this.auth.handleGoogleLogin(req.user as GoogleUserPayload);

    const base = cookieBase();

    // HttpOnly auth cookie
    res.cookie('accessToken', accessToken, {
      ...base,
      httpOnly: true,
      maxAge: expiresIn * 1000,
    });

    // CSRF token
    const csrf = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', csrf, {
      ...base,
      httpOnly: false,
      maxAge: expiresIn * 1000,
    });


    return res.redirect('/');
  }

  @Post('logout')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const base = cookieBase();

    res.clearCookie('accessToken', { ...base, httpOnly: true });
    res.clearCookie('XSRF-TOKEN', { ...base, httpOnly: false });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      code: 'LOGOUT_OK',
      message: 'Logged out',
      data: null,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }
}

