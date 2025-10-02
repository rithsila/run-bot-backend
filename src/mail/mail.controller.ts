// src/mail/mail.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) { }


  @Post('test')
  async test(@Body() body: { to: string; subject?: string }) {
    return this.mail.send({
      to: body.to,
      subject: body.subject ?? 'Test via Gmail SMTP',
      html: '<p>Hello from NestJS via Gmail SMTP (App Password)</p>',
    });
  }
}
