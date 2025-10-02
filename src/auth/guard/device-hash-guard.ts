import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class DeviceHashGuard implements CanActivate {
    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest();
        const deviceId: string | undefined = req.headers['x-device-id'];
        const deviceHash: string | undefined = req.headers['x-device-hash'];

        if (!deviceId || !deviceHash) {
            throw new ForbiddenException('Missing device headers');
        }

        // compute hash server-side
        const expect = crypto
            .createHash('sha256')
            .update(deviceId)
            .digest('hex');

        if (expect !== deviceHash) {
            throw new ForbiddenException('Device hash mismatch');
        }

        return true;
    }
}
