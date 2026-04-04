import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
    Req,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { SubscriptionsService } from './subscriptions.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';

@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly subscriptions: SubscriptionsService) {}

    @Get('me')
    getMySubscriptions(@Req() req: AuthRequest) {
        const userId = req?.user?.userId;
        if (!userId) throw new BadRequestException('AUTH_REQUIRED');
        return this.subscriptions.getByUser(userId);
    }

    @Get(':id')
    getById(@Param('id') id: string) {
        return this.subscriptions.getById(id);
    }

    @Patch(':id/notes')
    @Roles(Role.Admin)
    updateAdminNote(@Param('id') id: string, @Body('note') note?: string) {
        return this.subscriptions.updateAdminNote(id, note);
    }

    @Get()
    findByUserAndProduct(
        @Query('user') userId: string,
        @Query('product') productId: string,
    ) {
        if (!userId || !productId) {
            throw new BadRequestException('user and product are required');
        }

        return this.subscriptions.findByUserAndProduct(userId, productId);
    }
}
