import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serialize/serialize';
import { defaultPageFormat, defaultStyles, type UdfDocument } from '../src/model/types';

function baseDoc(body: UdfDocument['body']): UdfDocument {
  return { pageFormat: defaultPageFormat(), styles: defaultStyles(), body };
}

describe('serialize', () => {
  it('emits a single text run with offset 0', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'Merhaba' }] }]));
    expect(xml).toContain('<![CDATA[Merhaba]]>');
    expect(xml).toContain('<content startOffset="0" length="7"');
    expect(xml).toContain('format_id="1.8"');
    expect(xml).toContain('resolver="hvl-default"');
  });

  it('computes contiguous offsets across multiple runs', () => {
    const xml = serialize(
      baseDoc([
        { alignment: 'left', runs: [{ text: 'AB', bold: true }, { text: 'CDE' }] },
      ]),
    );
    expect(xml).toContain('<![CDATA[ABCDE]]>');
    expect(xml).toContain('startOffset="0" length="2"');
    expect(xml).toContain('bold="true"');
    expect(xml).toContain('startOffset="2" length="3"');
  });

  it('continues offsets across paragraphs', () => {
    const xml = serialize(
      baseDoc([
        { alignment: 'center', runs: [{ text: 'XX' }] },
        { alignment: 'justify', runs: [{ text: 'YYY' }] },
      ]),
    );
    expect(xml).toContain('<![CDATA[XXYYY]]>');
    expect(xml).toContain('Alignment="1"'); // center
    expect(xml).toContain('Alignment="3"'); // justify
    expect(xml).toContain('startOffset="2" length="3"');
  });

  it('emits an image run consuming two buffer positions', () => {
    const xml = serialize(
      baseDoc([
        { alignment: 'center', runs: [{ kind: 'image', imageData: 'QUJD', width: 10, height: 20 }] },
        { alignment: 'left', runs: [{ text: 'Z' }] },
      ]),
    );
    expect(xml).toContain('<image imageData="QUJD"');
    expect(xml).toContain('startOffset="0" length="1"'); // image
    expect(xml).toContain('startOffset="1" length="1"'); // image content
    expect(xml).toContain('startOffset="2" length="1"'); // 'Z'
  });

  it('escapes CDATA terminators in text', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'a]]>b' }] }]));
    expect(xml).not.toContain(']]>b]]>');
    expect(xml).toContain(']]]]><![CDATA[>'); // standard CDATA split escape
  });
});
