import { SetMetadata } from '@nestjs/common';
export type AppAudience = 'admin' | 'student' | 'instructor';
export const APP_KEY = 'app';
export const App = (aud: AppAudience) => SetMetadata(APP_KEY, aud);