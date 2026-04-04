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
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { UserService } from 'src/user/user.service';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './guard/public.decorator';
import { SkipCsrf } from './guard/skip-csrf.decorator';
import crypto from 'crypto';
import { GoogleUserPayload } from 'src/common/types/google-auth.type';
import { cookieBase } from 'src/common/cookies/cookie.util';
import { TurnstileAction } from 'src/turnstile/turnstile.decorator';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { TurnstileGuard } from 'src/turnstile/turnstile.guard';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly users: UserService,
    ) {}

    @Public()
    @TurnstileAction('register')
    @UseGuards(TurnstileGuard)
    @Post('signup')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @HttpCode(HttpStatus.CREATED)
    async signup(
        @Body() dto: SignupDto,
        @Req() req: Request,
    ): Promise<ApiSuccess<PublicUser>> {
        const userAgent =
            (req.headers['user-agent']?.toString() ?? '').slice(0, 200) || null;
        const referer =
            (req.headers['referer']?.toString() ?? '').slice(0, 200) || null;

        const deviceIdHeader =
            (req.headers['x-client-device-id'] as string | undefined) ??
            (req.headers['x-device-id'] as string | undefined);
        const deviceIdHash =
            deviceIdHeader &&
            deviceIdHeader.length >= 8 &&
            deviceIdHeader.length <= 128
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
    @TurnstileAction('login')
    @UseGuards(TurnstileGuard)
    @Post('login')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<
        ApiSuccess<{
            tokenType: 'Bearer';
            accessToken: string;
            expiresIn: number;
            user?: PublicUser;
        }>
    > {
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

        const { expiresIn, accessToken } = await this.auth.login(
            dto,
            telemetry,
        );

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
            code: 'ME',
            message: 'Successful',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Public()
    @Post('verify-email')
    @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 requests/min per IP (tune as you like)
    @HttpCode(HttpStatus.NO_CONTENT)
    async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
        // await this.auth.verifyEmail(dto.token);
    }

    @Public()
    @Post('resend-verification')
    @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5/min
    @HttpCode(HttpStatus.OK)
    async resendVerification(
        @Body() dto: ResendVerificationDto,
        @Req() req: Request,
    ) {
        await this.auth.resendVerification(
            dto.email,
            req.ip,
            req.get('user-agent') ?? undefined,
        );
        return {
            message:
                'If an account exists, we’ve sent a new verification email.',
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
        const { accessToken, expiresIn } = await this.auth.handleGoogleLogin(
            req.user as GoogleUserPayload,
        );

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
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
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

    @Public()
    @TurnstileAction('forgot-password')
    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    async forgotPassword(@Body() dto: { email: string }, @Req() req: Request) {
        const ip = getClientIp(req) ?? undefined; // 👈 coerce null → undefined
        const ua =
            (req.headers['user-agent']?.toString() ?? '').slice(0, 200) ||
            undefined;

        await this.auth.requestPasswordReset(
            dto?.email?.toString().trim() ?? '',
            ip,
            ua,
        );

        return {
            message:
                'If an account exists, we’ve sent an email with a reset link.',
        };
    }

    @Public()
    @TurnstileAction('reset-password')
    @SkipCsrf()
    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(@Body() dto: ResetPasswordDto) {
        await this.auth.resetPassword(dto.token, dto.password);
        return { message: 'Password reset successful.' };
    }
}
