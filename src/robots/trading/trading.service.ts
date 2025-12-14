import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AwsS3Service } from 'src/storage/aws-s3.service';
import type { File as MulterFile } from 'multer';
import { TradingRobot, TradingRobotDocument } from './trading-robot.schema';
import { CreateTradingRobotDto } from './dto/create-trading-robot.dto';

@Injectable()
export class TradingService {
  private static readonly MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB safety limit

  constructor(
    @InjectModel(TradingRobot.name)
    private readonly robotModel: Model<TradingRobotDocument>,
    private readonly s3: AwsS3Service,
  ) { }

  async findAll(): Promise<TradingRobot[]> {
    return this.robotModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async createRobot(dto: CreateTradingRobotDto): Promise<TradingRobotDocument> {
    return this.robotModel.create(dto);
  }

  async uploadRobotFile(file: MulterFile): Promise<{ downloadUrl: string }> {
    if (!file) throw new BadRequestException('FILE_REQUIRED');
    if (!file.buffer?.length) throw new BadRequestException('FILE_EMPTY');
    if (file.size > TradingService.MAX_UPLOAD_BYTES) {
      throw new BadRequestException('FILE_TOO_LARGE');
    }

    const upload = await this.s3.uploadFile(file, {
      folder: 'trading-robots',
      cacheControl: 'public, max-age=31536000',
    });

    return { downloadUrl: upload.url };
  }
}
