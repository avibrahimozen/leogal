// 404 sayfası (GitHub Pages kökte 404.html arar).
import { esc, head, url } from '../lib/seo.js';
import { links } from '../lib/links.js';

export function renderNotFound(data) {
  const b = data.business;
  const s = data.site;
  const l = links(b);
  return `<!DOCTYPE html>
<html lang="tr">
<head>
${head({ title: `Sayfa bulunamadı · ${b.name}`, description: b.description, canonical: url(s, s.sitePath), site: s, business: b, extra: '<meta name="robots" content="noindex">' })}
<style>
  :root { --komur: #141210; --koz: #e8871e; --pide: #f3ead9; --kul: #a89f94; --is-2: #2a241e;
    --display: "Bebas Neue", "Arial Narrow", Impact, sans-serif; --body: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--komur); color: var(--pide); font-family: var(--body); font-size: 18px; padding: 24px; }
  main { max-width: 520px; display: grid; gap: 16px; text-align: center; }
  h1 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 96px; line-height: .9; color: var(--koz); }
  p { margin: 0; color: var(--kul); }
  nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
  a { display: inline-block; text-decoration: none; font-family: var(--display); font-size: 22px; letter-spacing: .05em; padding: 12px 20px 10px; border-radius: 6px; border: 1px solid var(--koz); color: var(--koz); }
  a.p { background: var(--koz); color: var(--komur); }
  a:focus-visible { outline: 2px solid var(--koz); outline-offset: 3px; }
</style>
</head>
<body>
<main>
  <h1>404</h1>
  <p>Aradığınız sayfa burada değil. Ama döner hâlâ közde.</p>
  <nav>
    <a class="p" href="/${esc(s.menuPath)}">Menü</a>
    <a href="/${esc(s.sitePath)}">Ana sayfa</a>
    <a href="${esc(l.tel)}">${esc(b.phoneDisplay)}</a>
  </nav>
</main>
</body>
</html>
`;
}
