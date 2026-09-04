// Web sitesi ana sayfası (site/index.html).
import { esc, money, head, url, restaurantJsonLd, faqJsonLd, allergenText, kcalText } from '../lib/seo.js';
import { logo } from '../lib/assets.js';
import { links } from '../lib/links.js';
import * as icon from '../lib/icons.js';

const CSS = `
  :root {
    --komur: #141210; --is: #1f1b17; --is-2: #2a241e; --koz: #ffcc00; --koz-koyu: #c79a00; --ates: #e8871e; --kor: #b3261e;
    --pide: #f3ead9; --kul: #a89f94; --kul-koyu: #6f675f;
    --display: "Bebas Neue", "Oswald", "Arial Narrow", Impact, sans-serif;
    --body: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --maxw: 1080px;
  }
  * { box-sizing: border-box; }
  html { color-scheme: dark; -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  body { margin: 0; background: var(--komur); color: var(--pide); font-family: var(--body); font-size: 18px; line-height: 1.5; }
  a { color: var(--koz); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--koz); outline-offset: 3px; }
  h1, h2, h3 { font-family: var(--display); font-weight: 400; line-height: .95; margin: 0; letter-spacing: .02em; text-wrap: balance; }
  h2 { font-size: clamp(38px, 6vw, 60px); }
  p { margin: 0; }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 22px; }
  .eyebrow { font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: var(--koz); font-weight: 600; }
  .btn { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-family: var(--display); font-size: 22px; letter-spacing: .05em; line-height: 1; padding: 14px 22px 12px; border-radius: 6px; border: 1px solid var(--koz); background: var(--koz); color: var(--komur); white-space: nowrap; }
  .btn.ghost { background: transparent; color: var(--koz); }

  /* ---------- Üst çubuk ---------- */
  .top { position: sticky; top: 0; z-index: 10; background: rgba(20,18,16,.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--is-2); }
  .top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 64px; }
  .brandlink { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--pide); font-family: var(--display); font-size: 24px; letter-spacing: .06em; line-height: 1; }
  .brandlink b { color: var(--koz); font-weight: 400; }
  .brandlink span { white-space: nowrap; }
  .brandlink .logo-mark { width: 54px; height: 29px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .top nav { display: flex; gap: 22px; }
  .top nav a { text-decoration: none; color: var(--kul); font-weight: 600; font-size: 16px; white-space: nowrap; }
  .top nav a:hover { color: var(--pide); }
  .top .call { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--komur); background: var(--koz); font-family: var(--display); font-size: 20px; letter-spacing: .05em; padding: 9px 14px 7px; border-radius: 6px; white-space: nowrap; }
  .top .call svg { width: 18px; height: 18px; }
  @media (max-width: 760px) { .top nav { display: none; } }

  /* ---------- Giriş ---------- */
  .hero { position: relative; overflow: hidden; border-bottom: 1px solid var(--is-2); }
  .hero canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .hero .wrap { position: relative; display: grid; gap: 28px; padding-top: 72px; padding-bottom: 64px; }
  @media (min-width: 900px) { .hero .wrap { grid-template-columns: 1fr 1fr; align-items: center; padding-top: 80px; padding-bottom: 80px; } }
  .hero .mark { display: grid; justify-items: start; }
  .hero .mark .logo { width: min(440px, 100%); height: auto; filter: drop-shadow(0 12px 40px rgba(0,0,0,.5)); }
  .hero .lede { display: grid; gap: 18px; }
  .hero .slogan { font-size: clamp(22px, 3vw, 30px); font-style: italic; color: var(--kul); }
  .hero .slogan b { color: var(--pide); font-style: normal; font-weight: 600; }
  .hero .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .hero .clock { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; padding: 14px 16px; background: rgba(31,27,23,.8); border: 1px solid var(--is-2); border-radius: 8px; max-width: 420px; }
  .hero .clock svg { width: 34px; height: 34px; }
  .hero .clock .k { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--kul); }
  .hero .clock .v { font-family: var(--display); font-size: 30px; line-height: 1; letter-spacing: .04em; }
  .hero .clock .v small { font-family: var(--body); font-size: 13px; color: var(--kul); letter-spacing: 0; }

  /* ---------- Vaat şeridi ---------- */
  .perks { border-bottom: 1px solid var(--is-2); background: var(--is); }
  .perks ul { list-style: none; margin: 0; padding: 18px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 28px; }
  .perks li { display: flex; align-items: center; gap: 12px; font-weight: 600; }
  .perks svg { width: 26px; height: 26px; flex: 0 0 auto; color: var(--koz); }

  /* ---------- Bölüm düzeni ---------- */
  section.block { padding: 72px 0; border-bottom: 1px solid var(--is-2); }
  .head { display: grid; gap: 10px; margin-bottom: 34px; max-width: 640px; }
  .head p { color: var(--kul); font-size: 19px; }

  /* Odun ateşi */
  .fire { background: radial-gradient(90% 70% at 50% 110%, rgba(232,135,30,.22) 0%, rgba(232,135,30,0) 60%), var(--komur); }
  .fire .eyebrow { color: var(--ates); }
  .points { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .point { border-left: 3px solid var(--ates); padding: 6px 0 6px 18px; display: grid; gap: 8px; align-content: start; }
  .point h3 { font-size: 28px; }
  .point p { color: var(--kul); font-size: 17px; }

  /* SSS */
  .faq { display: grid; gap: 6px; max-width: 760px; }
  .faq details { border: 1px solid var(--is-2); border-radius: 8px; background: var(--is); }
  .faq summary { cursor: pointer; padding: 14px 18px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: "+"; font-family: var(--display); font-size: 24px; line-height: 1; color: var(--koz); }
  .faq details[open] summary::after { content: "–"; }
  .faq details p { margin: 0; padding: 0 18px 16px; color: var(--kul); }

  /* Öne çıkanlar */
  .dishes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .dish { background: var(--is); border: 1px solid var(--is-2); border-radius: 8px; padding: 20px; display: grid; grid-template-rows: auto 1fr auto auto; gap: 10px; }
  .dish h3 { font-size: 30px; }
  .dish p { color: var(--kul); font-size: 16px; }
  .dish .pr { display: flex; align-items: baseline; justify-content: space-between; border-top: 1px dashed var(--is-2); padding-top: 10px; }
  .dish .pr b { font-family: var(--display); font-size: 30px; font-weight: 400; color: var(--koz); font-variant-numeric: tabular-nums; }
  .dish .pr small { color: var(--kul-koyu); font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
  .dish .nut { display: grid; gap: 2px; font-size: 13px; color: var(--kul-koyu); line-height: 1.35; }
  .dish .nut b { color: var(--kul); font-weight: 600; }
  .all .fine { flex-basis: 100%; color: var(--kul-koyu); font-size: 14px; }
  .dish.child { border-color: var(--koz-koyu); border-style: dashed; }
  .all { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .all span { color: var(--kul); }

  /* Sipariş */
  .order { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .card { background: var(--is); border: 1px solid var(--is-2); border-radius: 8px; padding: 22px; display: grid; gap: 12px; align-content: start; }
  .card h3 { font-size: 30px; }
  .card p { color: var(--kul); }
  .card .big { font-family: var(--display); font-size: clamp(28px, 3.2vw, 40px); letter-spacing: .04em; line-height: 1; color: var(--pide); text-decoration: none; white-space: nowrap; }
  .card ol { margin: 0; padding-left: 20px; color: var(--kul); display: grid; gap: 4px; }

  /* Konum */
  .where { display: grid; gap: 22px; }
  @media (min-width: 900px) { .where { grid-template-columns: 1fr 1.3fr; align-items: start; } }
  .where address { font-style: normal; display: grid; gap: 6px; font-size: 19px; }
  .where address b { font-weight: 600; }
  .hours { list-style: none; margin: 10px 0 0; padding: 0; border-top: 1px solid var(--is-2); }
  .hours li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--is-2); font-variant-numeric: tabular-nums; }
  .hours li b { font-family: var(--display); font-size: 22px; font-weight: 400; letter-spacing: .04em; color: var(--koz); }
  .map { aspect-ratio: 4 / 3; border: 1px solid var(--is-2); border-radius: 8px; overflow: hidden; background: var(--is); }
  .map iframe { width: 100%; height: 100%; border: 0; display: block; filter: grayscale(.2) contrast(1.05); }

  /* Alt bilgi */
  footer { padding: 34px 0 40px; color: var(--kul); font-size: 15px; }
  footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; }
  footer a { color: var(--kul); }

  /* Mobil sabit sipariş çubuğu */
  .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: none; grid-template-columns: 1fr 1fr; background: var(--koz); box-shadow: 0 -8px 24px rgba(0,0,0,.45); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .bar a { display: flex; align-items: center; justify-content: center; gap: 8px; height: 58px; text-decoration: none; color: var(--komur); font-family: var(--display); font-size: 22px; letter-spacing: .05em; }
  .bar a + a { border-left: 1px solid rgba(20,18,16,.25); }
  .bar svg { width: 22px; height: 22px; }
  @media (max-width: 760px) { .bar { display: grid; } body { padding-bottom: 70px; } .top .call { display: none; } }
`;

const JS = `
  // Girişteki köz kıvılcımları: sakin, düşük yoğunluklu; hareket azaltma tercihinde durur.
  (function () {
    var c = document.getElementById('koz');
    if (!c || !c.getContext) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ctx = c.getContext('2d'), W, H, P = [], dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      var r = c.getBoundingClientRect();
      W = c.width = Math.max(1, Math.round(r.width * dpr)); H = c.height = Math.max(1, Math.round(r.height * dpr));
    }
    function spawn(y) {
      return { x: Math.random() * W, y: y === undefined ? Math.random() * H : y, r: (Math.random() * 1.6 + .6) * dpr,
        vx: (Math.random() - .5) * .15 * dpr, vy: -(Math.random() * .35 + .12) * dpr, a: Math.random(), da: Math.random() * .004 + .002 };
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createRadialGradient(W * .5, H * 1.05, 0, W * .5, H * 1.05, Math.max(W, H) * .9);
      g.addColorStop(0, 'rgba(232,135,30,.28)'); g.addColorStop(.45, 'rgba(179,38,30,.10)'); g.addColorStop(1, 'rgba(20,18,16,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,135,30,' + (0.15 + 0.6 * Math.abs(Math.sin(p.a * Math.PI))) + ')'; ctx.fill();
        if (reduce) continue;
        p.x += p.vx; p.y += p.vy; p.a += p.da;
        if (p.y < -10 || p.a > 1) P[i] = spawn(H + 5);
      }
      if (!reduce) requestAnimationFrame(draw);
    }
    size(); for (var i = 0; i < 60; i++) P.push(spawn());
    window.addEventListener('resize', function () { size(); });
    draw();
  })();
`;

/** Tüm ürünleri (bölüm öne çıkanları dahil) id ile bulunabilir hale getirir. */
function indexItems(data) {
  const map = new Map();
  for (const sec of data.sections) {
    for (const it of sec.items) if (!it.separator) map.set(it.id, { ...it, sec });
    if (sec.feature) map.set(sec.feature.id, { ...sec.feature, sec, isFeature: true });
  }
  return map;
}

function dishes(data) {
  const items = indexItems(data);
  return data.featured.map((f) => {
    const it = items.get(f.id);
    if (!it) throw new Error(`featured: bilinmeyen ürün id "${f.id}"`);
    const grams = it.sec.type === 'grams';
    const price = grams ? it.prices[0] : it.price;
    const kcal = grams ? it.kcal?.[0] : it.kcal;
    const unit = f.unit || (grams ? `${data.gramSizes[0]} gr` : 'Adet');
    const name = f.label || it.name;
    const al = allergenText(it, data.allergenNames || {});
    return `        <article class="dish${f.child ? ' child' : ''}">
          <h3>${esc(name)}</h3>
          <p>${esc(f.blurb)}</p>
          <div class="nut">${kcal != null ? `<b>${esc(kcalText(kcal))}</b>` : ''}${al ? `<span>${esc(al)}</span>` : ''}</div>
          <div class="pr"><small>${esc(unit)}</small><b>${money(price)}</b></div>
        </article>`;
  }).join('\n');
}

export function renderSite(data) {
  const b = data.business;
  const s = data.site;
  const l = links(b);
  const canonical = url(s, s.sitePath);
  const menuHref = s.menuPath;
  const title = `${b.name} · Odun Ateşinde Et Döner, ${b.address.district} ${b.address.city}`;
  const description = b.description;
  const [open, close] = [b.hours.opens, b.hours.closes];

  return `<!DOCTYPE html>
<html lang="tr">
<head>
${head({ title, description, canonical, site: s, business: b, jsonLd: [restaurantJsonLd(data), faqJsonLd(data)] })}
<style>${CSS}</style>
</head>
<body>

<header class="top">
  <div class="wrap">
    <a class="brandlink" href="#" aria-label="${esc(b.name)}, başa dön">
      ${logo('dark', { mark: true })}
      <span><b>${esc(b.shortName)}</b> ${esc(b.tagline)}</span>
    </a>
    <nav aria-label="Sayfa içi">
      <a href="#odun-atesi">Odun Ateşi</a>
      <a href="#lezzetler">Lezzetler</a>
      <a href="#siparis">Sipariş</a>
      <a href="#konum">Konum &amp; Saatler</a>
      <a href="${esc(menuHref)}">Tam Menü</a>
    </nav>
    <a class="call" href="${esc(l.tel)}">${icon.phone} ${esc(b.phoneDisplay)}</a>
  </div>
</header>

<section class="hero" aria-labelledby="baslik">
  <canvas id="koz" aria-hidden="true"></canvas>
  <div class="wrap">
    <div class="mark">
      ${logo('dark')}
      <h1 id="baslik" class="sr-only">${esc(b.name)} · Odun ateşinde et döner, ${esc(b.address.district)} ${esc(b.address.city)}</h1>
    </div>
    <div class="lede">
      <p class="slogan">Öğlen on birden gece üçe. <b>${esc(b.slogan)}</b></p>
      <p>${esc(b.address.district)}'nda odun ateşinde pişen et döner. Dürüm, pilav üstü, İskender; yanında sıcak çorba ve ev tatlısı. Gel otur, ya da ara, kapına gelsin.</p>
      <div class="clock">
        ${icon.clock}
        <div><div class="k">Her gün açık</div><div class="v">${esc(open)} – ${esc(close)} <small>(gece)</small></div></div>
      </div>
      <div class="actions">
        <a class="btn" href="${esc(menuHref)}">Menüyü Gör</a>
        <a class="btn ghost" href="${esc(l.whatsapp)}" target="_blank" rel="noopener">WhatsApp ile Sipariş</a>
      </div>
    </div>
  </div>
</section>

<div class="perks">
  <div class="wrap">
    <ul aria-label="Neden biz">
${b.perks.map((p, i) => `      <li>${icon.perks[i % icon.perks.length]}${esc(p)}</li>`).join('\n')}
    </ul>
  </div>
</div>

<main>

  <section class="block fire" id="odun-atesi" aria-labelledby="h-odun">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">${esc(b.wood.eyebrow)}</span>
        <h2 id="h-odun">${esc(b.wood.title)}</h2>
        <p>${esc(b.wood.lead)}</p>
      </div>
      <div class="points">
${b.wood.points.map((p) => `        <article class="point">
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.text)}</p>
        </article>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="block" id="lezzetler" aria-labelledby="h-lezzetler">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Közden tabağa</span>
        <h2 id="h-lezzetler">Ne yiyeceğinizi bilmiyorsanız buradan başlayın</h2>
        <p>Döner fiyatları ${data.gramSizes[0]} gram et içindir; ${data.gramSizes.slice(1).join(' ve ')} gramlık porsiyonlar menüde.</p>
      </div>
      <div class="dishes">
${dishes(data)}
      </div>
      <div class="all">
        <a class="btn ghost" href="${esc(menuHref)}">Tam menü ve fiyatlar</a>
        <span>Tatlılar, içecekler, tüm gramajlar, kalori ve alerjen bilgisi menüde.</span>
        <p class="fine">${esc(data.nutritionNotice.lines[0])} ${esc(data.nutritionNotice.lines[1])}</p>
      </div>
    </div>
  </section>

  <section class="block" id="siparis" aria-labelledby="h-siparis">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Alo Paket</span>
        <h2 id="h-siparis">Aramanız yeter, gerisi bizde</h2>
        <p>${esc(b.address.district)} içi paket servis. Sipariş için arayın ya da WhatsApp'tan yazın.</p>
      </div>
      <div class="order">
        <div class="card">
          <h3>Telefonla</h3>
          <a class="big" href="${esc(l.tel)}">${esc(b.phoneDisplay)}</a>
          <p>Her gün ${esc(open)} ile gece ${esc(close)} arası açık hat.</p>
        </div>
        <div class="card">
          <h3>WhatsApp ile</h3>
          <p>Menüden seçin, adresinizi yazın, onaylayalım.</p>
          <a class="btn" href="${esc(l.whatsapp)}" target="_blank" rel="noopener">WhatsApp'tan Yaz</a>
        </div>
        <div class="card">
          <h3>Nasıl işler?</h3>
          <ol>
            <li>Menüden seçiminizi yapın.</li>
            <li>Arayın ya da yazın; adresinizi alalım.</li>
            <li>Sıcak sıcak kapınıza gelsin.</li>
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="konum" aria-labelledby="h-konum">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">${esc(b.address.district)}, ${esc(b.address.city)}</span>
        <h2 id="h-konum">Arapsuyu'nda, Belediye Caddesi üzerinde</h2>
      </div>
      <div class="where">
        <div>
          <address>
            <b>${esc(b.name)}</b>
            <span>${esc(b.address.street)}</span>
            <span>${esc(b.address.district)} / ${esc(b.address.city)}</span>
            <a href="${esc(l.map)}" target="_blank" rel="noopener">Yol tarifi al</a>
          </address>
          <ul class="hours" aria-label="Çalışma saatleri">
            <li><span>Pazartesi – Cuma</span><b>${esc(open)} – ${esc(close)}</b></li>
            <li><span>Cumartesi</span><b>${esc(open)} – ${esc(close)}</b></li>
            <li><span>Pazar</span><b>${esc(open)} – ${esc(close)}</b></li>
          </ul>
        </div>
        <div class="map">
          <iframe title="Harita: ${esc(b.address.street)}, ${esc(b.address.district)}" src="${esc(l.mapEmbed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="sss" aria-labelledby="h-sss">
    <div class="wrap">
      <div class="head">
        <span class="eyebrow">Sık sorulanlar</span>
        <h2 id="h-sss">Merak edilenler</h2>
      </div>
      <div class="faq">
${b.faq.map((f) => `        <details>
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`).join('\n')}
      </div>
    </div>
  </section>

</main>

<footer>
  <div class="wrap">
    <span>© ${esc(b.name)} · ${esc(b.address.district)}, ${esc(b.address.city)}</span>
    <span><a href="${esc(menuHref)}">QR Menü</a> · <a href="${esc(l.tel)}">${esc(b.phoneDisplay)}</a></span>
  </div>
</footer>

<div class="bar" aria-label="Hızlı sipariş">
  <a href="${esc(l.tel)}">${icon.phone}Ara</a>
  <a href="${esc(menuHref)}">${icon.menu}Menü</a>
</div>

<script>${JS}</script>

</body>
</html>
`;
}
