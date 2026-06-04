export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build an attribute string. Skips undefined and `false` values.
// `true` becomes `name="true"`; numbers/strings are stringified.
export function attrs(map: Record<string, string | number | boolean | undefined>): string {
  let out = '';
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === false) continue;
    out += ` ${key}="${escapeXmlAttr(String(value))}"`;
  }
  return out;
}
