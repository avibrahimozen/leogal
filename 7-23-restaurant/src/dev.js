// Geliştirme sunucusu: klasörü yayınlar, src/ değişince yeniden üretir.
//   npm run dev  ->  http://localhost:4723/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { build, ROOT, OUT } from './build.js';

const PORT = Number(process.env.PORT) || 4723;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

async function serve(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const abs = normalize(join(OUT, path));
  if (!abs.startsWith(OUT)) { res.writeHead(403).end(); return; }
  try {
    const info = await stat(abs);
    if (info.isDirectory()) { res.writeHead(301, { Location: path + '/' }).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(abs));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı: ' + path);
  }
}

let timer = null;
function rebuild() {
  clearTimeout(timer);
  timer = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
}

await build();
watch(join(ROOT, 'src'), { recursive: true }, rebuild);
createServer(serve).listen(PORT, () => {
  console.log(`Site:  http://localhost:${PORT}/`);
  console.log(`Menü:  http://localhost:${PORT}/menu/`);
  console.log('src/ altındaki değişiklikler otomatik üretilir. Durdurmak için Ctrl+C.');
});
