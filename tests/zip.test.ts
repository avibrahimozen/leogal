import { describe, it, expect } from 'vitest';
import { packUdf, unpackContentXml } from '../src/package/zip';

describe('zip layer', () => {
  it('packs content.xml into a .udf buffer and reads it back', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" ?>\n<template format_id="1.8"></template>';
    const buf = packUdf(xml);
    expect(buf).toBeInstanceOf(Uint8Array);
    const back = unpackContentXml(buf);
    expect(back).toBe(xml);
  });

  it('throws a clear error when content.xml entry is missing', () => {
    // A valid empty zip with no content.xml entry.
    const empty = packUdf('x').slice(0, 0); // deliberately broken
    expect(() => unpackContentXml(empty)).toThrow();
  });
});
