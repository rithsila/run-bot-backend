// src/common/guards/skip-csrf.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'csrf:skip';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
