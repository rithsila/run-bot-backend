// src/mail/mail.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';
import { Public } from 'src/auth/guard/public.decorator';

@Controller('mail')
export class MailController {
  constructor(private readonly mail: MailService) { }


  @Public()
  @Get('test')
  async test() {
    return this.mail.send({
      to: 'theangrathana1@gmail.com',
      subject: 'Test via Gmail SMTP',
      html: '<p>Hello from NestJS via Gmail SMTP (App Password)</p>',
    });
  }
}
