// QR menü sayfası (index.html). Tek dosya, satır içi CSS, kütüphane yok.
import { esc, money, head, url, restaurantJsonLd, breadcrumbJsonLd, allergenText, kcalText } from '../lib/seo.js';
import { links } from '../lib/links.js';
import * as icon from '../lib/icons.js';
import { logo } from '../lib/assets.js';

const CSS = `
  :root {
    --komur: #141210;      /* zemin */
    --is: #1f1b17;         /* yüzey */
    --is-2: #2a241e;       /* kenar / ayraç */
    --koz: #ffcc00;        /* vurgu: logo sarısı */
    --koz-koyu: #c79a00;
    --ates: #e8871e;       /* odun ateşi turuncusu */
    --kor: #b3261e;        /* bölüm etiketi kırmızı */
    --pide: #f3ead9;       /* ana metin */
    --kul: #a89f94;        /* ikincil metin */
    --kul-koyu: #6f675f;
    --display: "Bebas Neue", "Oswald", "Arial Narrow", Impact, sans-serif;
    --body: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --maxw: 520px;
    --bar-h: 64px;
  }
  * { box-sizing: border-box; }
  html { color-scheme: dark; -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body {
    margin: 0; background: var(--komur); color: var(--pide);
    font-family: var(--body); font-size: 17px; line-height: 1.4;
    padding-bottom: calc(var(--bar-h) + env(safe-area-inset-bottom, 0px) + 12px);
  }
  a { color: var(--koz); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--koz); outline-offset: 3px; }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 18px; }

  /* ---------- Üst kısım ---------- */
  .hero {
    position: relative; padding: 28px 0 22px;
    background: radial-gradient(120% 80% at 50% 100%, rgba(232,135,30,.22) 0%, rgba(232,135,30,0) 60%), var(--komur);
    border-bottom: 1px solid var(--is-2);
  }
  .hero .wrap { display: grid; gap: 14px; }
  .brand { display: grid; justify-items: center; }
  .brand .logo { width: min(260px, 72%); height: auto; display: block; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .brand-name { font-family: var(--display); line-height: .9; letter-spacing: .01em; margin: 0; font-weight: 400; }
  .brand-name .l1 { display: block; font-size: 52px; color: var(--pide); letter-spacing: .04em; }
  .brand-name .l1 em { font-style: normal; color: var(--koz); }
  .brand-name .l2 { display: block; font-size: 26px; color: var(--pide); letter-spacing: .12em; }
  .slogan { margin: 0; font-size: 17px; color: var(--kul); font-style: italic; }
  .slogan b { color: var(--pide); font-style: normal; font-weight: 600; }
  .hours { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 4px 0 0; padding: 0; list-style: none; }
  .hours li { background: var(--is); border: 1px solid var(--is-2); border-radius: 6px; padding: 9px 12px; display: grid; gap: 2px; min-width: 0; }
  .hours .k { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--kul); }
  .hours .v { font-family: var(--display); font-size: 21px; line-height: 1; color: var(--pide); white-space: nowrap; }

  /* ---------- Yapışkan kategori çubuğu ---------- */
  .nav { position: sticky; top: 0; z-index: 5; background: rgba(20,18,16,.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid var(--is-2); }
  .nav ul { list-style: none; margin: 0 auto; padding: 10px 14px; max-width: var(--maxw); display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .nav ul::-webkit-scrollbar { display: none; }
  .nav a { display: inline-block; white-space: nowrap; text-decoration: none; font-family: var(--display); font-size: 18px; letter-spacing: .04em; color: var(--kul); padding: 6px 12px; border-radius: 999px; border: 1px solid transparent; }
  .nav a.on { color: var(--komur); background: var(--koz); }

  /* ---------- Bölümler ---------- */
  .menu { display: grid; gap: 34px; padding-top: 26px; }
  section { scroll-margin-top: 64px; }
  .sec-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-bottom: 12px; }
  .sec-head h2 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 30px; line-height: 1; letter-spacing: .02em; color: var(--pide); white-space: nowrap; padding: 4px 10px 2px; background: var(--kor); border-radius: 3px; transform: skew(-4deg); }
  .sec-head h2 span { display: inline-block; transform: skew(4deg); }
  .sec-head h2.koz { background: var(--koz); color: var(--komur); }
  .sec-head h2.yesil { background: #4f7a2b; }
  .sec-note { color: var(--kul); font-size: 14px; }

  /* Döner tablosu: gramaj sütunları */
  .grid { display: grid; grid-template-columns: 1fr repeat(3, 62px); gap: 0 8px; align-items: center; font-variant-numeric: tabular-nums; }
  .grid > * { padding: 10px 0; border-bottom: 1px solid var(--is-2); }
  .grid .hd { padding: 4px 0 8px; border-bottom: 2px solid var(--koz); font-family: var(--display); font-size: 17px; letter-spacing: .05em; color: var(--koz); text-align: right; line-height: 1; }
  .grid .hd:first-child { text-align: left; color: var(--kul); }
  .grid .hd small { display: block; font-family: var(--body); font-size: 11px; letter-spacing: .1em; color: var(--kul); }
  .grid .hd small.k { letter-spacing: 0; text-transform: none; }
  .grid .nm { font-weight: 600; }
  .grid .nm small, .list .nm .al { display: block; font-weight: 400; color: var(--kul-koyu); font-size: 12px; line-height: 1.3; }
  .grid .pr { text-align: right; font-weight: 600; font-size: 17px; }
  .grid .pr small, .list .pr small { display: block; font-weight: 400; color: var(--kul-koyu); font-size: 11px; letter-spacing: .02em; }
  .grid .pr.na { color: var(--kul-koyu); font-weight: 400; }
  .grid .sep { grid-column: 1 / -1; padding: 0; height: 10px; border-bottom: 1px dashed var(--is-2); margin-bottom: 4px; }

  /* Noktalı liste */
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .list li { display: flex; align-items: baseline; gap: 8px; padding: 8px 0; }
  .list .nm { flex: 0 1 auto; font-weight: 600; }
  .list .nm small { display: block; font-weight: 400; color: var(--kul); font-size: 14px; }
  .list .dots { flex: 1 1 auto; min-width: 16px; border-bottom: 2px dotted var(--kul-koyu); transform: translateY(-5px); }
  .list .pr { flex: 0 0 auto; font-weight: 700; font-size: 18px; font-variant-numeric: tabular-nums; color: var(--koz); }

  /* Özel öne çıkarma: çocuk menü */
  .feature { margin-top: 14px; padding: 14px 16px; border: 1px dashed var(--koz-koyu); border-radius: 8px; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
  .feature .t { grid-column: 1; grid-row: 1; font-family: var(--display); font-size: 24px; line-height: 1; color: var(--koz); }
  .feature .d { grid-column: 1; grid-row: 2; color: var(--kul); font-size: 14px; }
  .feature .d small { display: block; color: var(--kul-koyu); font-size: 12px; margin-top: 2px; }
  .notice { margin-top: 8px; padding: 14px 16px; border: 1px solid var(--is-2); border-radius: 8px; display: grid; gap: 8px; }
  .notice h2 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 22px; letter-spacing: .03em; color: var(--koz); }
  .notice p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--kul); }
  .notice .legend { display: flex; flex-wrap: wrap; gap: 6px; }
  .notice .legend span { font-size: 12px; border: 1px solid var(--is-2); border-radius: 999px; padding: 2px 9px; color: var(--pide); }
  .feature .pr { grid-column: 2; grid-row: 1 / span 2; font-family: var(--display); font-size: 34px; line-height: 1; color: var(--pide); white-space: nowrap; }

  /* ---------- Alt bilgi ---------- */
  .foot { margin-top: 40px; padding: 24px 0 18px; border-top: 1px solid var(--is-2); color: var(--kul); font-size: 15px; }
  .foot .wrap { display: grid; gap: 14px; }
  .foot address { font-style: normal; line-height: 1.5; }
  .foot address b { color: var(--pide); font-weight: 600; }
  .perks { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; }
  .perks li { border: 1px solid var(--is-2); border-radius: 999px; padding: 4px 11px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
  .foot .fine { font-size: 13px; color: var(--kul-koyu); }

  /* ---------- Sabit arama çubuğu ---------- */
  .callbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: var(--koz); padding: 0 0 env(safe-area-inset-bottom, 0px); box-shadow: 0 -8px 24px rgba(0,0,0,.45); }
  .callbar .in { max-width: var(--maxw); margin: 0 auto; height: var(--bar-h); display: grid; grid-template-columns: 1fr auto; align-items: stretch; }
  .callbar a { text-decoration: none; display: flex; align-items: center; gap: 12px; padding: 0 18px; color: var(--komur); }
  .callbar .tel .k { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .8; display: block; }
  .callbar .tel .v { font-family: var(--display); font-size: 24px; white-space: nowrap; line-height: 1; letter-spacing: .04em; display: block; }
  .callbar .wa { border-left: 1px solid rgba(20,18,16,.25); font-weight: 700; font-size: 15px; }
  .callbar svg { width: 24px; height: 24px; flex: 0 0 auto; }
`;

const JS = `
  // Kaydırırken üstteki kategori çubuğunda aktif bölümü işaretle
  (function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    function update() {
      var y = window.scrollY + 120, idx = 0;
      sections.forEach(function (s, i) { if (s && s.offsetTop <= y) idx = i; });
      links.forEach(function (a, i) { a.classList.toggle('on', i === idx); });
      var on = links[idx];
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(function () { update(); ticking = false; }); ticking = true; }
    }, { passive: true });
    update();
  })();
`;

function gramsSection(sec, data) {
  const cols = data.gramSizes;
  const names = data.allergenNames || {};
  const rows = sec.items.map((it) => {
    if (it.separator) return `      <div class="sep" aria-hidden="true"></div>`;
    const cells = it.prices.map((p, i) => p == null
      ? `<div class="pr na" aria-label="Yok">—</div>`
      : `<div class="pr">${money(p)}${it.kcal?.[i] != null ? `<small>≈${it.kcal[i]} kcal</small>` : ''}</div>`).join('');
    const al = allergenText(it, names);
    return `      <div class="nm">${esc(it.name)}${al ? `<small>${esc(al)}</small>` : ''}</div>${cells}`;
  }).join('\n');
  return `    <div class="grid" role="table" aria-label="${esc(sec.title)} fiyatları ve kalorileri">
      <div class="hd" role="columnheader">Ürün<small class="k">fiyat · ≈ kalori</small></div>
${cols.map((g) => `      <div class="hd" role="columnheader">${g}<small>gram</small></div>`).join('\n')}

${rows}
    </div>`;
}

function listSection(sec, data) {
  const names = data.allergenNames || {};
  const rows = sec.items.map((it) => {
    const al = allergenText(it, names);
    const name = (it.sub ? `${esc(it.name)} <small>${esc(it.sub)}</small>` : esc(it.name)) + (al ? `<span class="al">${esc(al)}</span>` : '');
    return `      <li><span class="nm">${name}</span><span class="dots"></span><span class="pr">${money(it.price)}${it.kcal != null ? `<small>${esc(kcalText(it.kcal))}</small>` : ''}</span></li>`;
  }).join('\n');
  const f = sec.feature;
  const fal = f ? allergenText(f, names) : '';
  const feature = f ? `
    <div class="feature">
      <span class="t">${esc(f.name)}</span>
      <span class="pr">${money(f.price)}</span>
      <span class="d">${esc(f.detail)}${f.kcal != null ? ` · ${esc(kcalText(f.kcal))}` : ''}${fal ? `<small>${esc(fal)}</small>` : ''}</span>
    </div>` : '';
  return `    <ul class="list">
${rows}
    </ul>${feature}`;
}

function section(sec, data) {
  const cls = sec.style && sec.style !== 'kor' ? ` class="${sec.style}"` : '';
  const note = sec.note ? `\n      <span class="sec-note">${esc(sec.note)}</span>` : '';
  const body = sec.type === 'grams' ? gramsSection(sec, data) : listSection(sec, data);
  return `  <section id="${sec.id}" aria-labelledby="h-${sec.id}">
    <div class="sec-head">
      <h2 id="h-${sec.id}"${cls}><span>${esc(sec.title)}</span></h2>${note}
    </div>
${body}
  </section>`;
}

/** Göreli üst dizin öneki: 'menu/' -> '../', '' -> ''. */
function up(path) {
  const depth = path.split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

export function renderMenu(data, { path = data.site.menuPath } = {}) {
  const b = data.business;
  const s = data.site;
  const l = links(b);
  const canonical = url(s, s.menuPath);
  const siteHref = up(path) + s.sitePath || './';
  const title = `${b.name} · Menü ve Fiyatlar`;
  const description = `${b.name} menü, fiyatlar, kalori ve alerjen bilgisi: odun ateşinde et döner (100/150/200 gr), çorbalar, tatlılar, içecekler. ${b.address.district}, ${b.address.city}.`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
${head({ title, description, canonical, site: s, business: b, jsonLd: [restaurantJsonLd(data, { embedMenu: true }), breadcrumbJsonLd(data)] })}
<style>${CSS}</style>
</head>
<body>

<header class="hero">
  <div class="wrap">
    <div class="brand">
      ${logo('dark')}
      <h1 class="sr-only">${esc(b.name)} · Menü ve Fiyatlar</h1>
    </div>
    <p class="slogan">${esc(b.slogan.split(',')[0])}, <b>${esc(b.slogan.split(',').slice(1).join(',').trim())}</b></p>
    <ul class="hours" aria-label="Çalışma bilgileri">
      <li><span class="k">Her gün açık</span><span class="v">${esc(b.hours.opens)} – ${esc(b.hours.closes)}</span></li>
      <li><span class="k">Alo Paket</span><span class="v">Hızlı Teslimat</span></li>
      <li><span class="k">Konum</span><span class="v">${esc(b.address.district)}</span></li>
    </ul>
  </div>
</header>

<nav class="nav" aria-label="Menü bölümleri">
  <ul>
${data.sections.map((sec, i) => `    <li><a href="#${sec.id}"${i === 0 ? ' class="on"' : ''}>${esc(sec.navLabel)}</a></li>`).join('\n')}
  </ul>
</nav>

<main class="wrap menu">

${data.sections.map((sec) => section(sec, data)).join('\n\n')}

  <section class="notice" id="bilgi" aria-labelledby="h-bilgi">
    <h2 id="h-bilgi">${esc(data.nutritionNotice.title)}</h2>
${data.nutritionNotice.lines.map((l) => `    <p>${esc(l)}</p>`).join('\n')}
    <div class="legend" aria-label="Alerjenler">${Object.values(data.allergenNames).map((n) => `<span>${esc(n)}</span>`).join('')}</div>
  </section>

</main>

<footer class="foot">
  <div class="wrap">
    <ul class="perks" aria-label="Öne çıkanlar">
${b.perks.map((p) => `      <li>${esc(p)}</li>`).join('\n')}
    </ul>
    <address>
      <b>${esc(b.name)}</b><br>
      ${esc(b.address.street)}<br>
      ${esc(b.address.district)} / ${esc(b.address.city)}<br>
      <a href="${esc(l.map)}" target="_blank" rel="noopener">Haritada aç</a> · <a href="${esc(siteHref)}">Web sitemiz</a>
    </address>
    <p class="fine">Fiyatlar TL cinsindendir. Fiyat değişikliği hakkı saklıdır.</p>
  </div>
</footer>

<div class="callbar">
  <div class="in">
    <a class="tel" href="${esc(l.tel)}" aria-label="Alo Paket için ara: ${esc(b.phoneDisplay)}">
      ${icon.phone}
      <span><span class="k">Alo Paket</span><span class="v">${esc(b.phoneDisplay)}</span></span>
    </a>
    <a class="wa" href="${esc(l.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp ile sipariş">
      ${icon.whatsapp}
      WhatsApp
    </a>
  </div>
</div>

<script>${JS}</script>

</body>
</html>
`;
}
