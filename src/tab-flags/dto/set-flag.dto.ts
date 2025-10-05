import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SetFlagDto {
    @IsString()
    @MinLength(1)
    tabId!: string;

    // default true if omitted
    @IsOptional()
    @IsBoolean()
    value?: boolean;
}
