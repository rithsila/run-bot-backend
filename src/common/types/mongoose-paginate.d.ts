// src/types/mongoose-paginate.d.ts
import 'mongoose';

declare module 'mongoose' {
    interface PaginateOptions {
        page?: number;
        limit?: number;
        sort?: any;
        select?: any;
        populate?: any;
        lean?: boolean;
        leanWithId?: boolean;
        customLabels?: Record<string, string>;
    }
    interface PaginateResult<T> {
        docs: T[];
        totalDocs: number;
        limit: number;
        hasPrevPage: boolean;
        hasNextPage: boolean;
        page?: number;
        totalPages: number;
        offset?: number;
        prevPage?: number | null;
        nextPage?: number | null;
        pagingCounter?: number;
        meta?: any;
    }
    interface PaginateModel<T> extends Model<T> {
        paginate(
            query?: FilterQuery<T>,
            options?: PaginateOptions,
        ): Promise<PaginateResult<T>>;
    }
}
