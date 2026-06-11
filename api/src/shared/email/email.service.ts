import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly useResend: boolean;
  private readonly from: string;
  private readonly frontendUrl: string;
  private resendClient?: { emails: { send: (opts: object) => Promise<unknown> } };

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('email.resendApiKey');
    this.from = config.get<string>('email.from') ?? 'noreply@kankaverse.app';
    this.frontendUrl = config.get<string>('email.frontendUrl') ?? 'http://localhost:5173';
    this.useResend = !!apiKey;

    if (this.useResend) {
      // Dinamik import: resend yüklüyse kullan, yoksa hata zaten startup'ta
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend');
      this.resendClient = new Resend(apiKey);
    }
  }

  buildVerifyLink(token: string): string {
    return `${this.frontendUrl}/verify-email?token=${token}`;
  }

  buildResetLink(token: string): string {
    return `${this.frontendUrl}/reset-password?token=${token}`;
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = this.buildVerifyLink(token);
    if (!this.useResend) {
      this.logger.log(`[EMAIL-CONSOLE] Doğrulama linki → ${to} : ${link}`);
      return;
    }
    await this.resendClient!.emails.send({
      from: this.from,
      to,
      subject: 'Kankaverse — E-postanı Doğrula',
      html: verificationEmailHtml(link),
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = this.buildResetLink(token);
    if (!this.useResend) {
      this.logger.log(`[EMAIL-CONSOLE] Şifre sıfırlama linki → ${to} : ${link}`);
      return;
    }
    await this.resendClient!.emails.send({
      from: this.from,
      to,
      subject: 'Kankaverse — Şifre Sıfırlama',
      html: passwordResetEmailHtml(link),
    });
  }
}

function verificationEmailHtml(link: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>E-posta Doğrulama</h2>
      <p>Kankaverse hesabını doğrulamak için aşağıdaki butona tıkla.</p>
      <p>Bu bağlantı <strong>24 saat</strong> geçerlidir.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#FF6B3D;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none">
          E-postanı Doğrula
        </a>
      </p>
      <p style="color:#888;font-size:12px">Ya da bu linki tarayıcına yapıştır: ${link}</p>
    </div>
  `;
}

function passwordResetEmailHtml(link: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Şifre Sıfırlama</h2>
      <p>Şifreni sıfırlamak için aşağıdaki butona tıkla.</p>
      <p>Bu bağlantı <strong>30 dakika</strong> geçerlidir.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#FF6B3D;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none">
          Şifremi Sıfırla
        </a>
      </p>
      <p style="color:#888;font-size:12px">Bu isteği sen yapmadıysan bu e-postayı dikkate alma.</p>
    </div>
  `;
}
