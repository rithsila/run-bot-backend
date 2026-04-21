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
    SavePresetDto,
} from './dto/settings.dto';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

interface AuthRequest extends Request {
    user: AuthUser;
}

@Controller('console')
export class ConsoleController {
    constructor(private readonly console: ConsoleService) {}

    @Get('instances')
    async listInstances() {
        return this.console.getAllInstances();
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
    ) {
        return this.console.getAuditLog(agentId, limit);
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

    @Get('instances/:agentId/presets')
    async listPresets(@Param('agentId') agentId: string) {
        return this.console.listPresets(agentId);
    }

    @Post('instances/:agentId/presets')
    @HttpCode(HttpStatus.CREATED)
    async savePreset(
        @Param('agentId') agentId: string,
        @Body() dto: SavePresetDto,
        @Req() req: AuthRequest,
    ) {
        return this.console.savePreset(
            agentId,
            dto.name,
            dto.settings,
            req.user.userId,
        );
    }

    @Delete('presets/:presetId')
    @HttpCode(HttpStatus.OK)
    async deletePreset(
        @Param('presetId') presetId: string,
        @Req() req: AuthRequest,
    ) {
        await this.console.deletePreset(presetId, req.user.userId);
        return { success: true };
    }
}
