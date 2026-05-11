import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Query,
    Req,
    HttpCode,
    HttpStatus,
    ParseIntPipe,
    DefaultValuePipe,
    BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { ConsoleService } from './console.service';
import { KillSwitchDto } from './dto/kill-switch.dto';
import {
    MasterEnableDto,
    PushSettingsDto,
} from './dto/settings.dto';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

interface AuthRequest extends Request {
    user: AuthUser;
}

@Controller('console')
export class ConsoleController {
    constructor(private readonly console: ConsoleService) {}

    @Get('instances')
    async listInstances(@Req() req: AuthRequest) {
        return this.console.getAllInstances(req.user.userId);
    }

    @Get('instances/:agentId/state')
    async getState(@Param('agentId') agentId: string) {
        const state = await this.console.getLatestState(agentId);
        if (!state)
            throw new BadRequestException(`No telemetry cached for ${agentId}`);
        return state;
    }

    @Get('instances/:agentId/audit')
    async getAuditLog(
        @Param('agentId') agentId: string,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Req() req: AuthRequest,
    ) {
        return this.console.getAuditLog(agentId, req.user.userId, limit);
    }

    @Post('instances/:agentId/kill-switch')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async killSwitch(
        @Param('agentId') agentId: string,
        @Body() dto: KillSwitchDto,
        @Req() req: AuthRequest,
    ) {
        if (dto.confirm !== true) {
            throw new BadRequestException(
                'confirm must be true to execute kill switch',
            );
        }
        return this.console.sendKillSwitch(agentId, req.user.userId);
    }

    @Post('instances/:agentId/kill-switch/reset')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async killReset(
        @Param('agentId') agentId: string,
        @Req() req: AuthRequest,
    ) {
        return this.console.sendKillReset(agentId, req.user.userId);
    }

    @Post('instances/:agentId/master-enable')
    @HttpCode(HttpStatus.OK)
    async masterEnable(
        @Param('agentId') agentId: string,
        @Body() dto: MasterEnableDto,
        @Req() req: AuthRequest,
    ) {
        return this.console.sendMasterEnable(
            agentId,
            dto.enabled,
            req.user.userId,
        );
    }

    @Post('instances/:agentId/settings')
    @HttpCode(HttpStatus.OK)
    async pushSettings(
        @Param('agentId') agentId: string,
        @Body() dto: PushSettingsDto,
        @Req() req: AuthRequest,
    ) {
        return this.console.pushSettings(
            agentId,
            dto.settings,
            req.user.userId,
        );
    }

    @Get('instances/:agentId/settings')
    async getCurrentSettings(@Param('agentId') agentId: string) {
        const settings = await this.console.getCurrentSettings(agentId);
        return { settings };
    }

}
