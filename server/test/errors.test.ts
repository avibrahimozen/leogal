import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

// Hata yakalayıcı: bozuk JSON 400, beklenmeyen hata 500 (loglanır), çok büyük gövde 413, bilinmeyen yol 404.
const db = createDb(':memory:');
const { app, matcher } = createApp(db, {
  testRoutes: (a) => {
    a.get('/api/_test/boom', () => {
      throw new Error('test patlaması');
    });
  },
});

const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => errorLog.mockClear());

afterAll(() => {
  errorLog.mockRestore();
  matcher.close();
});

describe('hata yakalayıcı', () => {
  it('beklenmeyen hata 500 ve genel mesaj döner, hata loglanır', async () => {
    const res = await request(app).get('/api/_test/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Sunucu hatası' });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]?.[1])).toContain('test patlaması');
  });

  it('bozuk JSON gövdesi 400 döner', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"phone": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Geçersiz JSON' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('çok büyük gövde 413 döner', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'İstek gövdesi çok büyük' });
  });

  it('bilinmeyen yol 404 döner', async () => {
    const res = await request(app).get('/api/yok');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Bulunamadı' });
  });
});
