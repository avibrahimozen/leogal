import { describe, it, expect } from 'vitest';
import { escapeXmlAttr, attrs } from '../src/serialize/xml';

describe('xml helpers', () => {
  it('escapes attribute special chars', () => {
    expect(escapeXmlAttr('a"b&c<d>')).toBe('a&quot;b&amp;c&lt;d&gt;');
  });

  it('builds an attribute string skipping undefined and false', () => {
    const s = attrs({ a: 1, b: undefined, c: 'x"y', d: false, e: true });
    expect(s).toBe(' a="1" c="x&quot;y" e="true"');
  });
});
