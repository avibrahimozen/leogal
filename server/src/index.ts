import { createServer } from 'node:http';
import { assertProductionSecrets, config } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';

// Üretimde varsayılan gizli değerlerle başlatmayı reddet; geliştirmede yalnızca uyar.
try {
  assertProductionSecrets(process.env);
} catch (e) {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const db = createDb();
const { app, hub } = createApp(db);

const server = createServer(app);
hub.attach(server);

server.listen(config.port, () => {
  console.log(`🚕 Ulak API http://localhost:${config.port} adresinde çalışıyor`);
});
