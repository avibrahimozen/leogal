// Ortak SEO yardımcıları: HTML kaçışı, <head> bloğu, schema.org (JSON-LD) nesneleri.

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

export function money(n) {
  return `${n} ₺`;
}

export function url(site, path = '') {
  return site.baseUrl + path;
}

/** Bir sayfanın <head> içeriği: başlık, açıklama, canonical, Open Graph, Twitter, yazı tipleri. */
export function head({ title, description, canonical, site, business, jsonLd = [], extra = '' }) {
  const image = url(site, 'assets/og.png');
  const ld = jsonLd
    .map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`)
    .join('\n');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(site.keywords.join(', '))}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#141210">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="restaurant">
<meta property="og:site_name" content="${esc(business.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${esc(site.locale)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(business.name)} logosu ve iletişim bilgileri">
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

/** schema.org Restaurant nesnesi. `menu` verilirse tam menü gömülür, yoksa menü adresi bağlanır. */
export function restaurantJsonLd(data, { embedMenu = false } = {}) {
  const b = data.business;
  const s = data.site;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url(s, s.sitePath) + '#restaurant',
    name: b.name,
    url: url(s, s.sitePath),
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

/** schema.org Menu nesnesi: bölümler, ürünler ve gramaja göre fiyat teklifleri. */
export function menuJsonLd(data) {
  const s = data.site;
  const offer = (price, description) => ({
    '@type': 'Offer',
    price: String(price),
    priceCurrency: data.currency,
    ...(description ? { description } : {}),
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': url(s, s.menuPath) + '#menu',
    name: `${data.business.name} Menü`,
    url: url(s, s.menuPath),
    inLanguage: 'tr',
    hasMenuSection: data.sections.map((sec) => {
      const items = sec.items.filter((it) => !it.separator).map((it) => ({
        '@type': 'MenuItem',
        name: it.sub ? `${it.name} (${it.sub})` : it.name,
        offers: sec.type === 'grams'
          ? data.gramSizes.map((g, i) => (it.prices[i] == null ? null : offer(it.prices[i], `${g} gr`))).filter(Boolean)
          : [offer(it.price)],
      }));
      if (sec.feature) {
        items.push({
          '@type': 'MenuItem',
          name: sec.feature.name,
          description: sec.feature.detail,
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
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: url(s, s.sitePath) },
      { '@type': 'ListItem', position: 2, name: 'Menü', item: url(s, s.menuPath) },
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

/** Site haritası (sitemap.xml). */
export function sitemapXml(data, lastmod) {
  const s = data.site;
  const pages = [
    { loc: url(s, s.sitePath), priority: '1.0' },
    { loc: url(s, s.menuPath), priority: '0.9' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url>
    <loc>${esc(p.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}
