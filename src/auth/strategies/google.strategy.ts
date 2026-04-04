// src/auth/strategies/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: process.env.GOOGLE_CALLBACK_URL!,
            scope: ['profile', 'email'],
            passReqToCallback: false,
        });
    }

    async validate(profile: Profile, done: VerifyCallback) {
        const email = profile.emails?.[0]?.value?.toLowerCase() ?? null;
        const firstName = profile.name?.givenName ?? '';
        const lastName = profile.name?.familyName ?? '';
        const photoURL = profile.photos?.[0]?.value;

        done(null, {
            provider: 'google' as const,
            googleId: profile.id,
            email,
            firstName,
            lastName,
            photoURL,
        });
    }
}
