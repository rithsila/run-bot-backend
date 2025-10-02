// src/brokers/brokers.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Broker, BrokerDocument } from './broker.schema';

@Injectable()
export class BrokersService {
  constructor(@InjectModel(Broker.name) private readonly model: Model<BrokerDocument>) {}

  async create(body: { name?: string; description?: string; logo?: string }) {
    if (!body?.name || !body.name.trim()) throw new BadRequestException('name is required');
    return this.model.create({
      name: body.name.trim(),
      description: body.description?.trim(),
      logo: body.logo?.trim(),
    });
  }

  async findAll() {
    return this.model.find().sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('Broker not found');
    return doc;
  }

  async update(id: string, body: { name?: string; description?: string; logo?: string }) {
    const update: Partial<Broker> = {};
    if (typeof body.name === 'string') update.name = body.name.trim();
    if (typeof body.description === 'string') update.description = body.description.trim();
    if (typeof body.logo === 'string') update.logo = body.logo.trim();

    const doc = await this.model.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
    if (!doc) throw new NotFoundException('Broker not found');
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Broker not found');
    return { deleted: true };
  }
}
