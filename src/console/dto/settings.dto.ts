import { IsBoolean, IsObject } from 'class-validator';

export class PushSettingsDto {
    @IsObject()
    settings!: Record<string, unknown>;
}

export class MasterEnableDto {
    @IsBoolean()
    enabled!: boolean;
}
