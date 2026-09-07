import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { ADMIN_CSP, API_CSP, WEB_CSP, policiesFor } from '../src/lib/securityHeaders.js';

// Web uygulaması (mobile: npm run build:web çıktısı) sunucu kökünde sunulur.
// Burada gerçek Expo çıktısı yerine aynı yerleşimde küçük bir sahte dizin kullanılır.

let webDir = '';
const INDEX_HTML = '<!DOCTYPE html><html lang="tr"><head><title>Ulak</title></head><body><div id="root"></div></body></html>';

beforeAll(() => {
  webDir = mkdtempSync(path.join(tmpdir(), 'ulak-web-'));
  writeFileSync(path.join(webDir, 'index.html'), INDEX_HTML);
  mkdirSync(path.join(webDir, '_expo', 'static', 'js', 'web'), { recursive: true });
  writeFileSync(path.join(webDir, '_expo', 'static', 'js', 'web', 'index-abc123.js'), 'console.log("ulak")');
  mkdirSync(path.join(webDir, 'assets'), { recursive: true });
  writeFileSync(path.join(webDir, 'assets', 'car.png'), 'png');
});

afterAll(() => {
  rmSync(webDir, { recursive: true, force: true });
});

describe('web uygulaması sunumu', () => {
  it('kök adres index.html, web CSP ve konum iznine açık Permissions-Policy ile döner', async () => {
    const { app } = createApp(createDb(':memory:'), { webDir });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('id="root"');
    expect(res.headers['content-security-policy']).toBe(WEB_CSP);
    expect(res.headers['permissions-policy']).toContain('geolocation=(self)');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('özetli paket dosyaları uzun süre önbelleklenir', async () => {
    const { app } = createApp(createDb(':memory:'), { webDir });
    const res = await request(app).get('/_expo/static/js/web/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    const asset = await request(app).get('/assets/car.png');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control'] ?? '').not.toContain('immutable');
  });

  it('uzantısız yollar index.html’e düşer (yenileme / derin bağlantı)', async () => {
    const { app } = createApp(createDb(':memory:'), { webDir });
    const res = await request(app).get('/giris/sofor').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('API, yönetim paneli ve eksik dosyalar etkilenmez', async () => {
    const { app } = createApp(createDb(':memory:'), { webDir });
    const api = await request(app).get('/api/yok').set('Accept', 'text/html');
    expect(api.status).toBe(404);
    expect(api.body).toEqual({ error: 'Bulunamadı' });
    expect(api.headers['content-security-policy']).toBe(API_CSP);

    const admin = await request(app).get('/admin/');
    expect(admin.status).toBe(200);
    expect(admin.headers['content-security-policy']).toBe(ADMIN_CSP);
    expect(admin.headers['permissions-policy']).toContain('geolocation=()');

    const missing = await request(app).get('/_expo/static/js/web/yok.js');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Bulunamadı' });

    const post = await request(app).post('/giris').send({});
    expect(post.status).toBe(404);
  });

  it('web dizini yoksa kök 404 JSON döner', async () => {
    const none = createApp(createDb(':memory:'), { webDir: null });
    const res = await request(none.app).get('/');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Bulunamadı' });

    const bogus = createApp(createDb(':memory:'), { webDir: path.join(webDir, 'yok') });
    expect((await request(bogus.app).get('/')).status).toBe(404);
  });

  it('web CSP yalnızca kendi betiklerine, OSM karolarına ve Nominatim’e izin verir', () => {
    expect(WEB_CSP).toContain("script-src 'self'");
    expect(WEB_CSP).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(WEB_CSP).toContain('https://tile.openstreetmap.org');
    expect(WEB_CSP).toContain('https://nominatim.openstreetmap.org');
    expect(WEB_CSP).toContain("frame-ancestors 'none'");
    expect(policiesFor('/api/health').csp).toBe(API_CSP);
    expect(policiesFor('/admin/').csp).toBe(ADMIN_CSP);
    expect(policiesFor('/').csp).toBe(WEB_CSP);
    expect(policiesFor('/api/health').permissions).toContain('geolocation=()');
    expect(policiesFor('/').permissions).toContain('geolocation=(self)');
  });
});
