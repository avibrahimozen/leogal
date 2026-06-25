import { describe, it, expect } from 'vitest';
import { parse, UdfParseError } from '../src/parse/parse';
import { serialize } from '../src/serialize/serialize';
import { defaultPageFormat, defaultStyles, type UdfDocument } from '../src/model/types';

function baseDoc(body: UdfDocument['body']): UdfDocument {
  return { pageFormat: defaultPageFormat(), styles: defaultStyles(), body };
}

describe('parse', () => {
  it('reads back a single text run with text resolved from offsets', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'Merhaba' }] }]));
    const doc = parse(xml);
    expect(doc.body).toHaveLength(1);
    expect(doc.body[0].alignment).toBe('left');
    expect(doc.body[0].runs[0]).toMatchObject({ text: 'Merhaba' });
  });

  it('resolves multiple runs and preserves bold', () => {
    const xml = serialize(
      baseDoc([{ alignment: 'center', runs: [{ text: 'AB', bold: true }, { text: 'CDE' }] }]),
    );
    const doc = parse(xml);
    const runs = doc.body[0].runs as any[];
    expect(doc.body[0].alignment).toBe('center');
    expect(runs[0]).toMatchObject({ text: 'AB', bold: true });
    expect(runs[1]).toMatchObject({ text: 'CDE' });
  });

  it('reads the page format from properties', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'x' }] }]));
    const doc = parse(xml);
    expect(doc.pageFormat.mediaSizeName).toBe(1);
    expect(doc.pageFormat.paperOrientation).toBe(1);
  });

  it('throws UdfParseError when the template root is missing', () => {
    expect(() => parse('<notatemplate/>')).toThrow(UdfParseError);
  });
});
