import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { User } from 'src/user/user.schema';

export type IndicatorDocument = Indicator & Document;
export type IndicatorPaginateModel = PaginateModel<IndicatorDocument>;

export enum IndicatorStatus {
    Request = 'Request',
    Verified = 'Verified',
    Rejected = 'Rejected',
}

@Schema({ collection: 'indicators', timestamps: true, versionKey: false })
export class Indicator {
    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        index: true,
        required: true,
    })
    user!: User;

    @Prop({
        type: String,
        trim: true,
        maxlength: 120,
        index: true,
        required: true,
    })
    username!: string;

    @Prop({
        type: String,
        enum: Object.values(IndicatorStatus),
        default: IndicatorStatus.Request,
        index: true,
    })
    status!: IndicatorStatus;

    @Prop({ type: String, trim: true })
    notes?: string;

    @Prop({ type: String, trim: true })
    adminNotes?: string;

    @Prop({ type: Types.ObjectId, ref: 'User', index: true })
    updatedBy?: Types.ObjectId | User;
}

export const IndicatorSchema = SchemaFactory.createForClass(Indicator);
IndicatorSchema.plugin(paginate);

IndicatorSchema.index({ user: 1, status: 1 });
IndicatorSchema.index({ user: 1 }, { unique: true });
