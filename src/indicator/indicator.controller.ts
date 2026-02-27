import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { IndicatorService } from './indicator.service';
import { RequestIndicatorDto } from './dto/request-indicator.dto';
import type { IndicatorDocument } from './indicator.schema';
import { PaginateIndicatorsDto } from './dto/paginate-indicators.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import { UpdateIndicatorAdminDto } from './dto/update-indicator-admin.dto';

@Controller('indicator')
export class IndicatorController {
  constructor(private readonly indicators: IndicatorService) { }

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async request(
    @Req() req: AuthRequest,
    @Body() dto: RequestIndicatorDto,
  ): Promise<ApiSuccess<IndicatorDocument>> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');

    const indicator = await this.indicators.requestIndicator({
      userId,
      username: dto.username,
      notes: dto.notes,
    });

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      code: 'INDICATOR_REQUESTED',
      message: 'Indicator request submitted',
      data: indicator,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }

  @Get()
  @Roles(Role.Admin)
  async list(@Query() query: PaginateIndicatorsDto) {
    const result = await this.indicators.paginate(query);

    // convenience: surface user names for tables
    const docs = result.docs.map((doc: any) => ({
      ...doc,
      userFirstName: doc.user?.firstName,
      userLastName: doc.user?.lastName,
      userEmail: doc.user?.email,
    }));

    return { ...result, docs };
  }

  @Patch(':id/admin')
  @Roles(Role.Admin)
  async adminUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateIndicatorAdminDto,
    @Req() req: AuthRequest,
  ) {
    const indicator = await this.indicators.updateAdmin(id, dto, req.user?.userId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      code: 'INDICATOR_UPDATED',
      message: 'Indicator updated',
      data: indicator,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: AuthRequest): Promise<ApiSuccess<IndicatorDocument>> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');

    const indicator = await this.indicators.getMyIndicator(userId);
    if (!indicator) throw new NotFoundException('INDICATOR_NOT_FOUND');

    return {
      success: true,
      statusCode: HttpStatus.OK,
      code: 'INDICATOR',
      message: 'Indicator fetched',
      data: indicator,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }
}
