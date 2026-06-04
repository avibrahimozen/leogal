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

  it('reports an overlap between runs', () => {
    const broken =
      '<template format_id="1.8"><content><![CDATA[ABCDE]]></content>' +
      '<elements resolver="hvl-default">' +
      '<paragraph><content startOffset="0" length="3" /><content startOffset="2" length="3" /></paragraph>' +
      '</elements></template>';
    const result = validateContentXml(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/overlap/i);
  });

  it('validates image spans as part of contiguity/coverage check', () => {
    const doc = baseDoc([
      {
        alignment: 'left',
        runs: [
          { kind: 'image' as const, imageData: 'iVBORw0KGgo=', width: 10, height: 10 },
          { text: 'Hi' },
        ],
      },
    ]);
    const xml = serialize(doc);
    expect(validateContentXml(xml)).toEqual({ ok: true, errors: [] });
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
