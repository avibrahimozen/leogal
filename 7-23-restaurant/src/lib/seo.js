// Ortak SEO yardımcıları: HTML kaçışı, <head> bloğu, schema.org (JSON-LD) nesneleri, sitemap, robots.
import { LANGS, alternates, fmt } from './i18n.js';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Marka işareti: rakamlar vurgulu, eğik çizgi düz. "7/23" -> <em>7</em>/<em>23</em> */
export function brandMark(shortName) {
  return String(shortName).split('/').map((part) => `<em>${esc(part)}</em>`).join('/');
}

/** "İçerir: Gluten, Süt · eser: yumurta" biçiminde alerjen özeti; ikisi de boşsa ''. */
export function allergenText(item, data) {
  const names = data.allergenNames || {};
  const ui = data.ui;
  const code = data.lang?.code || 'tr';
  const a = (item.allergens || []).map((k) => names[k] || k);
  const t = (item.traces || []).map((k) => names[k] || k);
  const parts = [];
  if (a.length) parts.push(`${ui.contains} ${a.join(', ')}`);
  if (t.length) parts.push(`${ui.traces} ${t.join(', ').toLocaleLowerCase(code)}`);
  return parts.join(' · ');
}

/** "≈ 600 kcal" */
export function kcalText(n, data) {
  return n == null ? '' : `≈ ${n} ${data.kcalUnit || 'kcal'}`;
}

export function money(n) {
  return `${n} ₺`;
}

export function url(site, path = '') {
  return site.baseUrl + path;
}

/** Bir sayfanın <head> içeriği: başlık, açıklama, canonical, hreflang, Open Graph, Twitter, yazı tipleri. */
export function head({ title, description, canonical, data, kind, jsonLd = [], extra = '' }) {
  const site = data.site;
  const business = data.business;
  const image = url(site, 'assets/og.png');
  const ld = jsonLd
    .map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`)
    .join('\n');
  const alts = kind ? alternates(kind) : [];
  const hreflang = alts.map((a) => `<link rel="alternate" hreflang="${a.code}" href="${esc(url(site, a.path))}">`)
    .concat(alts.filter((a) => a.default).map((a) => `<link rel="alternate" hreflang="x-default" href="${esc(url(site, a.path))}">`))
    .join('\n');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(site.keywords.join(', '))}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#141210">
<link rel="canonical" href="${esc(canonical)}">
${hreflang}
<meta property="og:type" content="restaurant">
<meta property="og:site_name" content="${esc(business.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${esc(site.locale)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(fmt(data.ui.ogAlt, { name: business.name }))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="format-detection" content="telephone=yes">
<link rel="icon" href="${esc(url(site, 'assets/logo-light.svg'))}" type="image/svg+xml">
<meta name="geo.region" content="TR-07">
<meta name="geo.placename" content="${esc(`${business.address.district}, ${business.address.city}`)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">
${extra}
${ld}`;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** schema.org Restaurant nesnesi. embedMenu ile tam menü gömülür, yoksa menü adresi bağlanır. */
export function restaurantJsonLd(data, { embedMenu = false } = {}) {
  const b = data.business;
  const s = data.site;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url(s, s.sitePath) + '#restaurant',
    name: b.name,
    url: url(s, s.sitePath),
    inLanguage: data.lang.code,
    telephone: b.phoneE164,
    image: url(s, 'assets/og.png'),
    logo: url(s, 'assets/logo-light.svg'),
    description: b.description,
    slogan: b.slogan,
    hasMap: `https://maps.google.com/?q=${encodeURIComponent(b.mapQuery)}`,
    areaServed: { '@type': 'City', name: `${b.address.district}, ${b.address.city}` },
    servesCuisine: b.cuisine,
    priceRange: b.priceRange,
    currenciesAccepted: data.currency,
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.address.street,
      addressLocality: b.address.district,
      addressRegion: b.address.city,
      addressCountry: b.address.country,
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAYS,
      opens: b.hours.opens,
      closes: b.hours.closes,
    },
    hasMenu: embedMenu ? menuJsonLd(data) : url(s, s.menuPath),
    potentialAction: {
      '@type': 'OrderAction',
      target: `tel:${b.phoneE164}`,
      deliveryMethod: 'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet',
    },
  };
}

/** schema.org Menu nesnesi: bölümler, ürünler, gramaja göre fiyat teklifleri, kalori ve alerjen açıklaması. */
export function menuJsonLd(data) {
  const s = data.site;
  const offer = (price, description) => ({
    '@type': 'Offer',
    price: String(price),
    priceCurrency: data.currency,
    ...(description ? { description } : {}),
  });
  const nutrition = (kcal) => (kcal == null ? {} : { nutrition: { '@type': 'NutritionInformation', calories: `${kcal} kcal` } });
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': url(s, s.menuPath) + '#menu',
    name: `${data.business.name} · ${data.ui.menuTitleSuffix}`,
    url: url(s, s.menuPath),
    inLanguage: data.lang.code,
    hasMenuSection: data.sections.map((sec) => {
      const items = sec.items.filter((it) => !it.separator).map((it) => ({
        '@type': 'MenuItem',
        name: it.sub ? `${it.name} (${it.sub})` : it.name,
        ...(allergenText(it, data) ? { description: allergenText(it, data) } : {}),
        ...nutrition(sec.type === 'grams' ? it.kcal?.[0] : it.kcal),
        offers: sec.type === 'grams'
          ? data.gramSizes.map((g, i) => (it.prices[i] == null ? null : offer(it.prices[i], fmt(data.ui.unitGram, { g })))).filter(Boolean)
          : [offer(it.price)],
      }));
      if (sec.feature) {
        items.push({
          '@type': 'MenuItem',
          name: sec.feature.name,
          description: [sec.feature.detail, allergenText(sec.feature, data)].filter(Boolean).join(' · '),
          ...nutrition(sec.feature.kcal),
          offers: [offer(sec.feature.price)],
        });
      }
      return { '@type': 'MenuSection', name: sec.title, hasMenuItem: items };
    }),
  };
}

/** schema.org FAQPage: sitedeki sık sorulan sorular. */
export function faqJsonLd(data) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: data.lang.code,
    mainEntity: data.business.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** schema.org BreadcrumbList: Ana sayfa > Menü. */
export function breadcrumbJsonLd(data) {
  const s = data.site;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: data.ui.home, item: url(s, s.sitePath) },
      { '@type': 'ListItem', position: 2, name: data.ui.menu, item: url(s, s.menuPath) },
    ],
  };
}

/** robots.txt: her şey açık; depodaki belge klasörleri ve kaynak kodu taranmasın. */
export function robotsTxt(data) {
  return `User-agent: *
Allow: /
Disallow: /docs/
Disallow: /7-23-restaurant/src/
Sitemap: ${url(data.site, 'sitemap.xml')}
`;
}

/** Site haritası: her dil için site ve menü sayfaları, hreflang alternatifleriyle. */
export function sitemapXml(data, lastmod) {
  const s = data.site;
  const pages = [];
  for (const kind of ['site', 'menu']) {
    const alts = alternates(kind);
    for (const a of alts) {
      pages.push({
        loc: url(s, a.path),
        priority: kind === 'site' ? (a.default ? '1.0' : '0.8') : (a.default ? '0.9' : '0.7'),
        alts: alts.map((x) => `    <xhtml:link rel="alternate" hreflang="${x.code}" href="${esc(url(s, x.path))}"/>`)
          .concat(alts.filter((x) => x.default).map((x) => `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(url(s, x.path))}"/>`)),
      });
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map((p) => `  <url>
    <loc>${esc(p.loc)}</loc>
${p.alts.join('\n')}
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

export { LANGS };
