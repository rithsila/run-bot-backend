// src/auth/api-key.guard.ts
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        const apiKeyHeader = request.headers['x-api-key'];

        if (!apiKeyHeader) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const receivedKey = Array.isArray(apiKeyHeader)
            ? apiKeyHeader[0]
            : apiKeyHeader;

        const validApiKey = this.configService.get<string>('API_KEY');
        if (!validApiKey) {
            throw new UnauthorizedException('Server API key is not configured');
        }

        if (receivedKey.trim() !== validApiKey.trim()) {
            throw new UnauthorizedException('Invalid API key');
        }

        return true;
    }
}
