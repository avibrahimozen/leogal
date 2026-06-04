import { describe, it, expect } from 'vitest';
import { validateContentXml } from '../src/validate/validate';
import { serialize } from '../src/serialize/serialize';
import { defaultPageFormat, defaultStyles, type UdfDocument } from '../src/model/types';

function baseDoc(body: UdfDocument['body']): UdfDocument {
  return { pageFormat: defaultPageFormat(), styles: defaultStyles(), body };
}

describe('validateContentXml', () => {
  it('passes for serializer output (contiguous, full coverage)', () => {
    const xml = serialize(
      baseDoc([
        { alignment: 'left', runs: [{ text: 'AB' }, { text: 'CDE' }] },
        { alignment: 'center', runs: [{ text: 'FG' }] },
      ]),
    );
    expect(validateContentXml(xml)).toEqual({ ok: true, errors: [] });
  });

  it('reports a gap between runs', () => {
    const broken =
      '<template format_id="1.8"><content><![CDATA[ABCDE]]></content>' +
      '<elements resolver="hvl-default">' +
      '<paragraph><content startOffset="0" length="2" /><content startOffset="3" length="2" /></paragraph>' +
      '</elements></template>';
    const result = validateContentXml(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/gap|contiguous/i);
  });

  it('reports coverage shorter than the buffer', () => {
    const broken =
      '<template format_id="1.8"><content><![CDATA[ABCDE]]></content>' +
      '<elements resolver="hvl-default">' +
      '<paragraph><content startOffset="0" length="2" /></paragraph>' +
      '</elements></template>';
    const result = validateContentXml(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/cover|length/i);
  });
});
