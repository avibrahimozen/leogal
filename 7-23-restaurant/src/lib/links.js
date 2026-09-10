// İletişim bağlantıları tek yerden üretilir.

export function links(business) {
  return {
    tel: `tel:${business.phoneE164}`,
    whatsapp: `https://wa.me/${business.phoneE164.replace('+', '')}?text=${encodeURIComponent(business.whatsappText)}`,
    map: `https://maps.google.com/?q=${encodeURIComponent(business.mapQuery)}`,
    mapEmbed: `https://www.google.com/maps?q=${encodeURIComponent(business.mapQuery)}&z=16&output=embed`,
  };
}
