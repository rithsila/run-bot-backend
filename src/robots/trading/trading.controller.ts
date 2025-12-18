import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
    UnauthorizedException,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { File as MulterFile } from 'multer';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { TradingService } from './trading.service';
import { CreateTradingRobotDto } from './dto/create-trading-robot.dto';
import { Public } from 'src/auth/guard/public.decorator';
import { TradingRobot } from './trading-robot.schema';

const MAX_ROBOT_FILE_BYTES = 25 * 1024 * 1024; 

@Controller('trading')
export class TradingController {
    constructor(private readonly tradingService: TradingService) { }

  @Post('robots')
  @Roles(Role.Creator, Role.Admin)
  @HttpCode(HttpStatus.CREATED)
    async createRobot(
        @Req() req: AuthRequest,
        @Body() dto: CreateTradingRobotDto,
    ): Promise<ApiSuccess<{ id: string }>> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
        const robot = await this.tradingService.createRobot(dto);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'CREATE_TRADING_ROBOT',
            message: 'Created successfully',
      data: { id: robot.id },
    };
  }

  @Get('robots')
  @Public()
  @HttpCode(HttpStatus.OK)
  async listRobots(
    @Req() req: AuthRequest,
  ): Promise<ApiSuccess<TradingRobot[]>> {
    const robots = await this.tradingService.findAll();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'LIST_TRADING_ROBOTS',
      message: 'Success',
      data: robots,
    };
  }

  @Post('upload')
  @Roles(Role.Creator, Role.Admin)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: MAX_ROBOT_FILE_BYTES },
        }),
    )
    @HttpCode(HttpStatus.CREATED)
    async uploadRobot(
        @Req() req: AuthRequest,
        @UploadedFile() file: MulterFile,
    ): Promise<ApiSuccess<{ downloadUrl: string }>> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const { downloadUrl } = await this.tradingService.uploadRobotFile(file);
        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'UPLOAD_TRADING_ROBOT',
            message: 'Uploaded successfully',
            data: { downloadUrl },
        };
    }
}
