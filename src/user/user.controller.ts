// src/user/users.controller.ts
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, Req, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserAffiliatesDto } from './dto/update-user-affiliates.dto';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';
import { isValidObjectId } from 'mongoose';

@Controller('user')
export class UsersController {
    constructor(private readonly service: UserService) { }

    @Get()
    list(@Query() query: UserQueryDto) {
        return this.service.paginate(query);
    }

    @Delete(':id')
    async deleteUser(@Param('id') id: string): Promise<void> {
        await this.service.deleteById(id);
    }

    @Patch(':id/affiliates')
    @HttpCode(204)
    async updateAffiliates(
        @Param('id') id: string,
        @Body() dto: UpdateUserAffiliatesDto,
    ): Promise<void> {
        await this.service.updateAffiliates(id, dto);
    }

    @Patch(':id/password')
    async adminSetPassword(@Param('id') id: string, @Body() dto: AdminSetPasswordDto) {
        if (!isValidObjectId(id)) throw new BadRequestException('Invalid user id');
        await this.service.adminSetPassword(id, dto);
        return { ok: true };
    }
    
}
