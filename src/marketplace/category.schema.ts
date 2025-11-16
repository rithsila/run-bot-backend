// src/marketplace/category.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;


@Schema({ collection: 'categories' }) // collection name
export class Category {
    @Prop({ type: String, required: true, trim: true })
    name!: string;

    @Prop({ type: String })
    note?: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
