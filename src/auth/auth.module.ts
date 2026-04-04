// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from 'src/user/user.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { TurnstileModule } from 'src/turnstile/turnstile.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/user.schema';
import {
    EmailVerificationToken,
    EmailVerificationTokenSchema,
} from './email-verification-token.schema';
import { MailModule } from 'src/mail/mail.module';
import {
    PasswordResetToken,
    PasswordResetTokenSchema,
} from './password-reset-token.schema';
import { QueueModule } from 'src/queue/queue.module';

@Module({
    imports: [
        ConfigModule,
        UserModule,
        MailModule,
        QueueModule,
        PassportModule.register({
            defaultStrategy: 'jwt-bearer',
            session: false,
        }),
        JwtModule.register({}),
        TurnstileModule,
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            {
                name: EmailVerificationToken.name,
                schema: EmailVerificationTokenSchema,
            },
            { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
        ]),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, GoogleStrategy],
    exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
