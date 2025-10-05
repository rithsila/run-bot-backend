import { SetMetadata } from '@nestjs/common';

export const TURNSTILE_ACTION = 'turnstile:action';

export const TurnstileAction = (action: string) => SetMetadata(TURNSTILE_ACTION, action);
