// FTP / klasik hosting için yükleme paketi üretir.
//   npm run dist  ->  7-23-restaurant/dist/  (bu klasörün İÇİNDEKİLERİ alan adının köküne yüklenir)
// Alan adı üzerinden yayınlanacağı varsayılır: adresler antalyagecedonercisi.com tabanlıdır.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadData, render, ROOT } from './build.js';

const DIST = join(ROOT, 'dist');

const HTACCESS = `# 7 23 Gece Dönercisi — Apache ayarları
ErrorDocument 404 /404.html
AddDefaultCharset utf-8

# HTTP -> HTTPS ve www -> köke yönlendir
RewriteEngine On
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} ^www\\. [NC]
RewriteRule ^ https://antalyagecedonercisi.com%{REQUEST_URI} [L,R=301]

# Önbellek: HTML kısa, diğerleri uzun
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "public, max-age=300"
  </FilesMatch>
  <FilesMatch "\\.(png|svg|xml|txt)$">
    Header set Cache-Control "public, max-age=86400"
  </FilesMatch>
</IfModule>
`;

const data = await loadData();
data.site.domainActive = true;
data.site.baseUrl = data.site.domainBaseUrl;

const files = await render(data);
files.delete('CNAME'); // GitHub Pages'e özgü
files.set('.htaccess', HTACCESS);

await rm(DIST, { recursive: true, force: true });
for (const [rel, content] of files) {
  const abs = join(DIST, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
  console.log(`dist/${rel}`);
}
console.log(`\nHazır: ${DIST}\nBu klasörün içindekileri FTP ile alan adının köküne (genelde public_html/) yükleyin.`);
