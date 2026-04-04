// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { User, UserSchema } from './user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './user.controller';
import {
    EmailVerificationToken,
    EmailVerificationTokenSchema,
} from '../auth/email-verification-token.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            {
                name: EmailVerificationToken.name,
                schema: EmailVerificationTokenSchema,
            },
        ]),
    ],
    providers: [UserService],
    controllers: [UsersController],
    exports: [UserService],
})
export class UserModule {}
