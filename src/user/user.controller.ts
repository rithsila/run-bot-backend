// src/user/users.controller.ts
import { Controller, Get } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UsersController {
    constructor(private readonly service: UserService) { }

    @Get('creators')
    findCreators() {
        return this.service.findCreators();
    }
}
