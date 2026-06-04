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

  it('round-trips an ImageRun preserving imageData, width, and height', () => {
    // Minimal 1x1 PNG as base64
    const imageData =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imgRun: import('../src/model/types').ImageRun = {
      kind: 'image',
      imageData,
      width: 10,
      height: 20,
    };
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [imgRun] }]));
    const doc = parse(xml);
    const recovered = doc.body[0].runs[0] as import('../src/model/types').ImageRun;
    expect(recovered.kind).toBe('image');
    expect(recovered.imageData).toBe(imageData);
    expect(recovered.width).toBe(10);
    expect(recovered.height).toBe(20);
  });

  it('is idempotent across two serialize/parse cycles with an image (no injected space runs)', () => {
    const imageData =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imgRun: import('../src/model/types').ImageRun = {
      kind: 'image',
      imageData,
      width: 10,
      height: 20,
    };
    const doc = baseDoc([{ alignment: 'left', runs: [imgRun, { text: 'Z' }] }]);

    const cycle1 = parse(serialize(doc));
    const runs1 = cycle1.body[0].runs;
    expect(runs1).toHaveLength(2);
    expect(runs1[0]).toMatchObject({ kind: 'image', imageData, width: 10, height: 20 });
    expect(runs1[1]).toEqual({ text: 'Z' });

    const cycle2 = parse(serialize(cycle1));
    const runs2 = cycle2.body[0].runs;
    expect(runs2).toHaveLength(2);
    expect(runs2[0]).toMatchObject({ kind: 'image', imageData, width: 10, height: 20 });
    expect(runs2[1]).toEqual({ text: 'Z' });

    // The two cycles must be IDENTICAL — no unbounded growth.
    expect(runs2).toEqual(runs1);
  });

  it('single round-trip with an image yields exactly [image, "Z"] (no phantom space run)', () => {
    const imageData =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imgRun: import('../src/model/types').ImageRun = {
      kind: 'image',
      imageData,
      width: 10,
      height: 20,
    };
    const doc = parse(serialize(baseDoc([{ alignment: 'left', runs: [imgRun, { text: 'Z' }] }])));
    const runs = doc.body[0].runs;
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ kind: 'image', imageData, width: 10, height: 20 });
    expect(runs[1]).toEqual({ text: 'Z' });
  });

  it('preserves a legitimate single-character run NOT preceded by an image', () => {
    const doc = parse(serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'X' }] }])));
    const runs = doc.body[0].runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ text: 'X' });
  });

  it('throws UdfParseError when an <image> element has empty imageData', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'x' }] }])).replace(
      /<content /,
      '<image startOffset="0" length="1" imageData="" width="10" height="10" /><content ',
    );
    expect(() => parse(xml)).toThrow(UdfParseError);
  });

  it('throws UdfParseError when the CDATA content section is missing', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'x' }] }])).replace(
      /<content><!\[CDATA\[.*?\]\]><\/content>/s,
      '<content></content>',
    );
    expect(() => parse(xml)).toThrow(UdfParseError);
  });

  it('throws UdfParseError when the <elements> section is missing', () => {
    const xml = serialize(baseDoc([{ alignment: 'left', runs: [{ text: 'x' }] }])).replace(
      /<elements[^>]*>[\s\S]*?<\/elements>/,
      '',
    );
    expect(() => parse(xml)).toThrow(UdfParseError);
  });
});
