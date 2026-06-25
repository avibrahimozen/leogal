import { describe, it, expect } from 'vitest';
import { defaultPageFormat, defaultStyles, type UdfDocument } from '../src/model/types';

describe('model defaults', () => {
  it('default page format is A4 portrait', () => {
    const pf = defaultPageFormat();
    expect(pf.mediaSizeName).toBe(1);
    expect(pf.paperOrientation).toBe(1);
    expect(pf.leftMargin).toBeCloseTo(70.875);
  });

  it('default styles include hvl-default Times New Roman 12', () => {
    const s = defaultStyles().find((x) => x.name === 'hvl-default');
    expect(s).toBeDefined();
    expect(s!.family).toBe('Times New Roman');
    expect(s!.size).toBe(12);
  });

  it('a minimal document is constructible', () => {
    const doc: UdfDocument = {
      pageFormat: defaultPageFormat(),
      styles: defaultStyles(),
      body: [
        { alignment: 'left', runs: [{ text: 'Merhaba' }] },
      ],
    };
    expect(doc.body[0].runs[0]).toMatchObject({ text: 'Merhaba' });
  });
});
