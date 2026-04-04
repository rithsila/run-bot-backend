import { Controller, Post, Body } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Controller('realtime')
export class RealtimeController {
    constructor(private readonly rt: RealtimeGateway) {}

    @Post('test-publish')
    test(@Body('id') id: string) {
        this.rt.publishBadge(id || 'news');
        return { ok: true, id: id || 'news' };
    }
}
