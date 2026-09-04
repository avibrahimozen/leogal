import { createServer } from 'node:http';
import { config } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { startMaintenance } from './maintenance.js';

const db = createDb();
const { app, hub, matcher } = createApp(db);

const server = createServer(app);
hub.attach(server);

// Periyodik bakım (düşen sürücü süpürmesi) yalnızca gerçek sunucuda çalışır; testler zamanlayıcı başlatmaz.
const stopMaintenance = startMaintenance(db, hub);

server.listen(config.port, () => {
  console.log(`🚕 Ulak API http://localhost:${config.port} adresinde çalışıyor`);
});

/** Düzgün kapanış: zamanlayıcıları durdur, bağlantıları kapat, veritabanını serbest bırak. */
function shutdown(signal: string): void {
  console.log(`${signal} alındı, sunucu kapatılıyor...`);
  stopMaintenance();
  matcher.close();
  hub.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Açık bağlantılar kapanmayı geciktirirse zorla çık
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
