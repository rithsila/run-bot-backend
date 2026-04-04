import { IsBoolean, Equals } from 'class-validator';

export class KillSwitchDto {
    @IsBoolean()
    @Equals(true, { message: 'confirm must be true to execute kill switch' })
    confirm!: boolean;
}
