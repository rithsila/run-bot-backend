// src/signal/signal.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SignatureGuard } from './signature.guard';

@Controller('signal')
export class SignalController {
    @UseGuards(SignatureGuard)
    @Post('webhook')
    async webhook(@Body() dto: any) {
        console.log("------------------------", dto)
    }
}
