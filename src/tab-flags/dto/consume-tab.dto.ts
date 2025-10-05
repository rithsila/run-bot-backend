import { IsString, MinLength } from 'class-validator';

export class ConsumeTabDto {
    @IsString()
    @MinLength(1)
    tabId!: string;
}
