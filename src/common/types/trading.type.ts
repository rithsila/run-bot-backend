import { Types } from "mongoose";
import { Direction, Pair } from "src/trading-plan/trading-plan.enum";

export type TradingPlanLean = {
    _id: Types.ObjectId;
    pair: Pair;
    direction: Direction;
    description?: string;
    tradingViewId: string;
    thumbnailUrl: string;
    publishedBy: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
};