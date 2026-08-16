import { createServer } from 'node:http';
import { config } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';

const db = createDb();
const { app, hub } = createApp(db);

const server = createServer(app);
hub.attach(server);

server.listen(config.port, () => {
  console.log(`🚕 Ulak API http://localhost:${config.port} adresinde çalışıyor`);
});
