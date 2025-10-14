// src/security/webhook-realm.decorator.ts
import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by ApiKeyGuard to select which set of keys to use.
 */
export const WEBHOOK_REALM = 'webhookRealm';

/**
 * Decorator to tag a controller or handler with a "realm" name.
 * Example: @WebhookRealm('retailer') -> reads keys from WEBHOOK_KEYS__retailer
 */
export const WebhookRealm = (realm: string) =>
    SetMetadata(WEBHOOK_REALM, (realm ?? 'default').toLowerCase());
