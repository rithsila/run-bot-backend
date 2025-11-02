// src/user/dto/update-user-role.dto.ts
import { IsEnum } from 'class-validator';
import { Role } from '../user.enum';

export class UpdateUserRoleDto {
    @IsEnum(Role, { message: 'role must be a valid Role' })
    role!: Role;
}
