import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { readUdf, writeUdf, validate } from '../src/index';
import { defaultPageFormat, defaultStyles, type UdfDocument } from '../src/model/types';

function syntheticDoc(): UdfDocument {
  return {
    pageFormat: defaultPageFormat(),
    styles: defaultStyles(),
    body: [
      { alignment: 'center', runs: [{ text: 'DAVA DİLEKÇESİ', bold: true }] },
      { alignment: 'justify', runs: [{ text: 'Açıklamalar bölümü metni.' }] },
      { alignment: 'left', runs: [{ text: 'Sonuç ve talep.' }] },
    ],
  };
}

describe('round-trip', () => {
  it('writeUdf then readUdf preserves the model semantics', () => {
    const doc = syntheticDoc();
    const udf = writeUdf(doc);
    const back = readUdf(udf);
    expect(back.body).toHaveLength(3);
    expect(back.body[0].runs[0]).toMatchObject({ text: 'DAVA DİLEKÇESİ', bold: true });
    expect(back.body[0].alignment).toBe('center');
    expect(back.body[1].alignment).toBe('justify');
  });

  it('validate passes for generated documents', () => {
    const udf = writeUdf(syntheticDoc());
    const result = validate(udf);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  // OPTIONAL: runs only when the real (git-ignored) sample is present locally.
  const samplePath = 'Samples/İsmail hakkı çelik dava dilekçesi son.udf';
  const maybe = existsSync(samplePath) ? it : it.skip;
  maybe('parses the real UYAP sample without throwing and validates', () => {
    const buf = readFileSync(samplePath);
    const doc = readUdf(new Uint8Array(buf));
    expect(doc.body.length).toBeGreaterThan(0);
    const result = validate(writeUdf(doc));
    expect(result.ok).toBe(true);
  });
});
