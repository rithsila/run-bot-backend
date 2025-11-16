// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;
  private fromName: string;
  private fromEmail: string;


  constructor(private readonly config: ConfigService) {
    this.fromName = this.config.get<string>('MAIL_FROM_NAME') || 'No-Reply';
    this.fromEmail = this.config.get<string>('MAIL_FROM_EMAIL')!;

    // initialize once on startup; keep a single pooled transporter
    this.init().catch((err) => {
      this.logger.error('Mail transporter init failed', err as any);
    });
  }

  private async init() {
    const user = this.config.get<string>('MAIL_FROM_EMAIL');
    const pass = this.config.get<string>('GMAIL_APP_PASSWORD');

    if (!user || !pass) {
      this.logger.warn('MAIL_FROM_EMAIL / GMAIL_APP_PASSWORD not set — Mail disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // 465
      auth: { user, pass },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      // Production-friendly timeouts
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });

    try {
      await this.transporter.verify();
      this.logger.log('Nodemailer SMTP verified (Gmail App Password).');
    } catch (e) {
      this.logger.error('SMTP verify failed', e as any);
      // Keep instance but mark transporter undefined so sends no-op/fail fast
      this.transporter = undefined;
    }
  }

  private ensureTransport() {
    if (!this.transporter) {
      throw new Error('Mail transport unavailable (bad creds or init failed).');
    }
    return this.transporter;
  }

  async send(opts: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }) {
    const tx = this.ensureTransport();

    // Provide minimal plain text if only HTML is supplied
    const text = opts.text ?? (opts.html ? this.stripHtml(opts.html) : undefined);

    const info = await tx.sendMail({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      text,
      html: opts.html,
      replyTo: opts.replyTo,
      headers: {
        // Helps deliverability & unsub flows if you add them later
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        ...opts.headers,
      },
    });

    this.logger.debug(`Mail sent: ${info.messageId}`);
    return info;
  }

  // ---- Convenience methods you'll call from AuthService ----

  async sendEmailVerification(to: string, link: string) {
    const subject = 'Verify your email';
    const html = `
      <h2>Confirm your email</h2>
      <p>This link expires in 24 hours.</p>
      <p><a href="${link}" target="_blank" rel="noopener">Verify email</a></p>
      <p>If the button doesn’t work, paste this URL into your browser:</p>
      <p>${link}</p>
    `;
    return this.send({ to, subject, html });
  }

  async sendPasswordReset(to: string, link: string) {
    const subject = 'Reset your password';
    const html = `
    <span style="display:none!important;opacity:0;max-height:0;max-width:0;overflow:hidden;">
      Use this link to reset your password. It expires in 20 minutes.
    </span>
    <h2>Reset your password</h2>
    <p>This link expires in <strong>20 minutes</strong>.</p>
    <p>
      <a href="${link}" target="_blank" rel="noopener"
         style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
        Reset password
      </a>
    </p>
    <p>If the button doesn’t work, paste this URL into your browser:</p>
    <p><a href="${link}" target="_blank" rel="noopener">${link}</a></p>
  `;
    return this.send({ to, subject, html });
  }

  // ---- tiny utility ----
  private stripHtml(html: string) {
    return html.replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
