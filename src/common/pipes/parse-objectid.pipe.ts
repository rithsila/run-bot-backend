// src/common/pipes/parse-objectid.pipe.ts
import { BadRequestException, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

export class ParseObjectIdPipe implements PipeTransform<string, string> {
    transform(value: string) {
        if (!Types.ObjectId.isValid(value)) {
            throw new BadRequestException('Invalid ObjectId');
        }
        return value;
    }
}
