// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.init().catch(err =>
      this.logger.error('Mail transporter init failed', err),
    );
  }

  private async init() {
    const user = this.config.get<string>('MAIL_FROM_EMAIL')!;
    const pass = this.config.get<string>('GMAIL_APP_PASSWORD')!;
    // Port 465 (secure) or 587 (STARTTLS). Either works.
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true = 465, false = 587
      auth: { user, pass },
    });
    this.logger.log('Nodemailer set up with Gmail App Password (SMTP).');
  }

  async send(opts: { to: string | string[]; subject: string; text?: string; html?: string }) {
    if (!this.transporter) await this.init();

    const fromName = this.config.get<string>('MAIL_FROM_NAME') || 'No-Reply';
    const fromEmail = this.config.get<string>('MAIL_FROM_EMAIL')!;
    const info = await this.transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    this.logger.debug(`Mail sent: ${info.messageId}`);
    return info;
  }
}
