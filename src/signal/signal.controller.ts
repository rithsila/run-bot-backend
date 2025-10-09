// src/signal/signal.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SignatureGuard } from './signature.guard';
import { Public } from 'src/auth/guard/public.decorator';

@Controller('signal')
export class SignalController {
    @UseGuards(SignatureGuard)
    
    @Public()
    @Post('webhook')
    async webhook(@Body() dto: any) {
        console.log("------------------------", dto)
    }
}
