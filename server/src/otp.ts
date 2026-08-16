import { createHmac, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { nowIso, type Db } from './db.js';
import type { SmsSender } from './lib/sms.js';

export class OtpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface OtpRow {
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  send_count: number;
  window_started_at: string;
  last_sent_at: string;
}

/**
 * SMS ile telefon doğrulama (OTP) servisi.
 *
 * Akış: kod iste -> SMS gelir -> kodu doğrula -> kısa ömürlü doğrulama
 * token'ı al -> kayıt isteğinde bu token'ı gönder. Kod 5 dakika geçerlidir;
 * yeniden gönderim ve hatalı deneme sınırları kaba kuvveti engeller.
 */
export class OtpService {
  constructor(
    private db: Db,
    private sms: SmsSender,
  ) {}

  async request(phone: string): Promise<{ expiresInSec: number; resendAfterSec: number; devCode?: string }> {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone) as
      | OtpRow
      | undefined;

    let sendCount = 0;
    let windowStartedAt = now;
    if (row) {
      const sinceLast = now - Date.parse(row.last_sent_at);
      if (sinceLast < config.otpResendCooldownMs) {
        const wait = Math.ceil((config.otpResendCooldownMs - sinceLast) / 1000);
        throw new OtpError(429, `Yeni kod için ${wait} saniye bekleyin`);
      }
      const windowAge = now - Date.parse(row.window_started_at);
      if (windowAge < 3_600_000) {
        sendCount = row.send_count;
        windowStartedAt = Date.parse(row.window_started_at);
        if (sendCount >= config.otpMaxSendsPerHour) {
          throw new OtpError(429, 'Çok fazla kod istendi. Lütfen 1 saat sonra tekrar deneyin');
        }
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now + config.otpTtlMs).toISOString();
    this.db
      .prepare(
        `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, send_count, window_started_at, last_sent_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)
         ON CONFLICT(phone) DO UPDATE SET
           code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
           send_count = excluded.send_count, window_started_at = excluded.window_started_at,
           last_sent_at = excluded.last_sent_at`,
      )
      .run(
        phone,
        this.hash(phone, code),
        expiresAt,
        sendCount + 1,
        new Date(windowStartedAt).toISOString(),
        new Date(now).toISOString(),
      );

    await this.sms.send(phone, `Ulak doğrulama kodun: ${code}. Kod 5 dakika geçerlidir.`);

    return {
      expiresInSec: Math.floor(config.otpTtlMs / 1000),
      resendAfterSec: Math.floor(config.otpResendCooldownMs / 1000),
      // Sadece console sağlayıcısında: geliştirme/test kolaylığı için kod yanıtta döner
      ...(this.sms.kind === 'console' ? { devCode: code } : {}),
    };
  }

  /** Kodu doğrular; başarılıysa kayıt sırasında kullanılacak kısa ömürlü token döner. */
  verify(phone: string, code: string): string {
    const row = this.db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone) as
      | OtpRow
      | undefined;
    if (!row) throw new OtpError(400, 'Önce doğrulama kodu isteyin');
    if (Date.now() > Date.parse(row.expires_at)) {
      this.db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
      throw new OtpError(400, 'Kodun süresi doldu. Yeni kod isteyin');
    }
    if (row.attempts >= config.otpMaxAttempts) {
      this.db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
      throw new OtpError(429, 'Çok fazla hatalı deneme. Yeni kod isteyin');
    }
    if (row.code_hash !== this.hash(phone, code)) {
      this.db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone);
      throw new OtpError(400, 'Kod hatalı');
    }
    this.db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);
    // Mevcut kullanıcıysa telefonu doğrulanmış olarak işaretle
    this.db.prepare('UPDATE users SET phone_verified_at = ? WHERE phone = ?').run(nowIso(), phone);
    return jwt.sign({ sub: phone, purpose: 'phone-verify' }, config.jwtSecret, {
      expiresIn: config.otpVerifiedTokenTtl,
    });
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
  }
}

/** Kayıt isteğindeki doğrulama token'ını çözer; geçerliyse telefonu döner. */
export function verifyPhoneToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (payload.purpose !== 'phone-verify' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
