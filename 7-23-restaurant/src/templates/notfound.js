// 404 sayfası (GitHub Pages kökte tek 404.html arar; üç dil aynı sayfada).
import { esc, head, url } from '../lib/seo.js';
import { links } from '../lib/links.js';
import { LANGS, localize } from '../lib/i18n.js';

export function renderNotFound(rawData) {
  const data = localize(rawData);
  const b = data.business;
  const s = data.site;
  const l = links(b);
  const blocks = LANGS.map((lang) => {
    const d = localize(rawData, lang.code);
    return `  <section lang="${lang.code}">
    <p>${esc(d.ui.notFound)}</p>
    <nav>
      <a class="p" href="/${esc(lang.menuPath)}">${esc(d.ui.menu)}</a>
      <a href="/${esc(lang.sitePath)}">${esc(d.ui.home)}</a>
    </nav>
  </section>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
${head({ title: `${data.ui.notFoundTitle} · ${b.name}`, description: b.description, canonical: url(s, s.sitePath), data, extra: '<meta name="robots" content="noindex">' })}
<style>
  :root { --komur: #141210; --koz: #ffcc00; --pide: #f3ead9; --kul: #a89f94; --is-2: #2a241e;
    --display: "Bebas Neue", "Arial Narrow", Impact, sans-serif; --body: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--komur); color: var(--pide); font-family: var(--body); font-size: 18px; padding: 24px; }
  main { max-width: 560px; display: grid; gap: 22px; text-align: center; }
  h1 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 96px; line-height: .9; color: var(--koz); }
  section { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--is-2); }
  p { margin: 0; color: var(--kul); }
  nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
  a { display: inline-block; text-decoration: none; font-family: var(--display); font-size: 20px; letter-spacing: .05em; padding: 10px 18px 8px; border-radius: 6px; border: 1px solid var(--koz); color: var(--koz); }
  a.p { background: var(--koz); color: var(--komur); }
  a:focus-visible { outline: 2px solid var(--koz); outline-offset: 3px; }
  .tel { border: 0; padding: 0; font-family: var(--body); font-size: 16px; color: var(--kul); }
</style>
</head>
<body>
<main>
  <h1>404</h1>
${blocks}
  <a class="tel" href="${esc(l.tel)}">${esc(b.phoneDisplay)}</a>
</main>
</body>
</html>
`;
}
