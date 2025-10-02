import { SignInMethod } from "src/auth/signin-method.enum";

export type GoogleUserPayload = {
    provider: SignInMethod.Google;
    googleId: string;
    email: string | null;
    firstName: string;
    lastName: string;
    photoURL?: string;
};