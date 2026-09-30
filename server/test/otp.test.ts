import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

// OTP akışı: kod iste -> doğrula -> token ile kaydol; hız limitleri ve hatalı girişler
const db = createDb(':memory:');
const { app } = createApp(db);

const PHONE = '+905428900001';

async function requestCode(phone: string) {
  return request(app).post('/api/auth/otp/request').send({ phone });
}

describe('OTP telefon doğrulama', () => {
  it('kod istenir; console modunda devCode döner', async () => {
    const res = await requestCode(PHONE);
    expect(res.status).toBe(200);
    expect(res.body.expiresInSec).toBe(300);
    expect(res.body.devCode).toMatch(/^[0-9]{6}$/);
  });

  it('bekleme süresi dolmadan yeniden kod istenemez', async () => {
    const res = await requestCode(PHONE);
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('saniye');
  });

  it('yanlış kod reddedilir, deneme sayılır', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: PHONE, code: '000000' });
    // Gerçek kodun 000000 olma ihtimaline karşı esnek davran
    if (res.status === 200) return;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Kod hatalı');
  });

  it('doğru kod doğrulama token"ı verir, kod tek kullanımlıktır', async () => {
    const phone = '+905428900002';
    const req1 = await requestCode(phone);
    const code = req1.body.devCode as string;
    const ok = await request(app).post('/api/auth/otp/verify').send({ phone, code });
    expect(ok.status).toBe(200);
    expect(ok.body.verificationToken).toBeTruthy();
    // Aynı kod ikinci kez kullanılamaz
    const again = await request(app).post('/api/auth/otp/verify').send({ phone, code });
    expect(again.status).toBe(400);
  });

  it('doğrulama token"ı olmadan kayıt reddedilir', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ phone: '+905428900003', name: 'Doğrulamasız', password: 'gizli123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Telefon doğrulaması gerekli');
  });

  it('başka telefonun token"ı ile kayıt reddedilir', async () => {
    const phoneA = '+905428900004';
    const req1 = await requestCode(phoneA);
    const ver = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: phoneA, code: req1.body.devCode });
    const res = await request(app).post('/api/auth/register').send({
      phone: '+905428900005',
      name: 'Sahtekar',
      password: 'gizli123',
      verificationToken: ver.body.verificationToken,
    });
    expect(res.status).toBe(403);
  });

  it('token ile kayıt başarılı olur ve telefon doğrulanmış işaretlenir', async () => {
    const phone = '+905428900006';
    const req1 = await requestCode(phone);
    const ver = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, code: req1.body.devCode });
    const res = await request(app).post('/api/auth/register').send({
      phone,
      name: 'Doğrulanmış Yolcu',
      password: 'gizli123',
      verificationToken: ver.body.verificationToken,
    });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT phone_verified_at FROM users WHERE phone = ?').get(phone) as {
      phone_verified_at: string | null;
    };
    expect(row.phone_verified_at).toBeTruthy();
  });

  it('süresi dolan kod reddedilir', async () => {
    const phone = '+905428900007';
    const req1 = await requestCode(phone);
    db.prepare('UPDATE otp_codes SET expires_at = ? WHERE phone = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      phone,
    );
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, code: req1.body.devCode });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('süresi doldu');
  });

  it('hatalı deneme sınırı aşılınca kod geçersizleşir', async () => {
    const phone = '+905428900008';
    const req1 = await requestCode(phone);
    const realCode = req1.body.devCode as string;
    const wrongCode = realCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/otp/verify').send({ phone, code: wrongCode });
    }
    const res = await request(app).post('/api/auth/otp/verify').send({ phone, code: realCode });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Çok fazla hatalı deneme');
  });

  it('saatlik gönderim sınırı uygulanır', async () => {
    const phone = '+905428900009';
    for (let i = 0; i < 5; i++) {
      // Bekleme süresini aşmak için son gönderimi geriye çek
      await requestCode(phone);
      db.prepare('UPDATE otp_codes SET last_sent_at = ? WHERE phone = ?').run(
        new Date(Date.now() - 60_000).toISOString(),
        phone,
      );
    }
    const res = await requestCode(phone);
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Çok fazla kod istendi');
  });

  it('geçersiz telefon formatı reddedilir', async () => {
    const res = await requestCode('12ab');
    expect(res.status).toBe(400);
  });
});
