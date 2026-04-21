import { IsBoolean, IsObject, IsString, IsNotEmpty } from 'class-validator';

export class PushSettingsDto {
    @IsObject()
    settings!: Record<string, unknown>;
}

export class SavePresetDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsObject()
    settings!: Record<string, unknown>;
}

export class MasterEnableDto {
    @IsBoolean()
    enabled!: boolean;
}
