// src/brokers/schemas/broker.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type BrokerDocument = Broker & Document;

@Schema({ timestamps: true })
export class Broker {
    @Prop({ required: true, trim: true, maxlength: 200 })
    name: string;

    @Prop({ trim: true, maxlength: 2000 })
    description?: string;

    @Prop({ trim: true, maxlength: 500 })
    logo?: string; 
}


export const BrokerSchema = SchemaFactory.createForClass(Broker);
