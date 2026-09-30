import { config } from '../config.js';

/**
 * Takılabilir SMS gönderici. Sağlayıcı SMS_PROVIDER ortam değişkeniyle seçilir:
 *  - console (varsayılan): kodu sunucu loguna yazar; geliştirme/test için.
 *  - twilio: Twilio REST API ile gerçek SMS gönderir (+90 KKTC numaraları desteklenir).
 */
export interface SmsSender {
  readonly kind: 'console' | 'twilio';
  send(to: string, body: string): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  readonly kind = 'console' as const;

  async send(to: string, body: string): Promise<void> {
    console.log(`📱 [SMS → ${to}] ${body}`);
  }
}

export class TwilioSmsSender implements SmsSender {
  readonly kind = 'twilio' as const;

  constructor(
    private accountSid: string,
    private authToken: string,
    private from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.from, Body: body }).toString(),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Twilio SMS gönderilemedi (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

export function createSmsSender(): SmsSender {
  if (config.smsProvider === 'twilio') {
    const { accountSid, authToken, from } = config.twilio;
    if (!accountSid || !authToken || !from) {
      throw new Error(
        'SMS_PROVIDER=twilio için TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ve TWILIO_FROM gerekli',
      );
    }
    return new TwilioSmsSender(accountSid, authToken, from);
  }
  return new ConsoleSmsSender();
}
