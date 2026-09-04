import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

// Üretim modunda (NODE_ENV=production) console SMS sağlayıcısı OTP kodunu API yanıtında
// (devCode) DÖNMEMELİ; kod yalnızca sunucu loguna yazılır. config yüklenmeden önce ayarlanır.
vi.hoisted(() => {
  process.env.NODE_ENV = 'production';
});

const db = createDb(':memory:');
const { app } = createApp(db);
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
});

describe('OTP — üretim modunda devCode sızmaz', () => {
  it('config üretim modunu görür', () => {
    expect(config.nodeEnv).toBe('production');
    expect(config.smsProvider).toBe('console');
  });

  it('yanıtta devCode yoktur, yanıt şekli korunur; kod logdan okunarak akış tamamlanır', async () => {
    const phone = '+905428910001';
    const res = await request(app).post('/api/auth/otp/request').send({ phone });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('devCode');
    expect(res.body.expiresInSec).toBe(300);
    expect(res.body.resendAfterSec).toBe(45);

    // Kod console sağlayıcısı tarafından loga yazılır (operatör görebilir, API istemcisi göremez)
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes(phone));
    expect(line).toBeTruthy();
    const code = line?.match(/\b([0-9]{6})\b/)?.[1];
    expect(code).toMatch(/^[0-9]{6}$/);

    const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code });
    expect(ver.status).toBe(200);
    expect(ver.body.verificationToken).toBeTruthy();
  });
});
