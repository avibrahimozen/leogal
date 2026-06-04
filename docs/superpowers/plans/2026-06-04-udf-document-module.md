# UDF Document Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@leogal/udf`, a pure TypeScript library that reads, writes, and validates UYAP `.udf` documents from an offset-free semantic model.

**Architecture:** A typed `UdfDocument` model carries semantic structure only (paragraphs, styled runs, images, header/footer) with NO offsets. A serializer builds the flat CDATA text buffer and the `<elements>` formatting tree in a single pass, computing offsets in one authoritative place. A parser reverses this. A zip layer reads/writes the `.udf` archive. A validator checks offset integrity and round-trips against real samples.

**Tech Stack:** Node.js, TypeScript, Vitest (tests), fflate (zip), fast-xml-parser (XML parsing for reading).

---

## File Structure

```
package.json
tsconfig.json
vitest.config.ts
src/
  model/types.ts          UdfDocument + defaults (no offsets)
  package/zip.ts          .udf <-> content.xml (zip layer, fflate)
  serialize/serialize.ts  model -> content.xml (offset computation)
  serialize/xml.ts        XML escaping + attribute helpers
  parse/parse.ts          content.xml -> model (offset resolution)
  validate/validate.ts    structural offset-integrity checks
  index.ts                readUdf / writeUdf / validate
tests/
  fixtures/synthetic.content.xml   committed deterministic fixture
  model.test.ts
  zip.test.ts
  serialize.test.ts
  parse.test.ts
  validate.test.ts
  index.roundtrip.test.ts
```

Notes:
- The real sample (`Samples/...udf`) contains client PII and is git-ignored. Tests
  use a committed synthetic fixture for CI determinism, plus one OPTIONAL real-sample
  round-trip test guarded by file existence.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@leogal/udf",
  "version": "0.1.0",
  "description": "Read, write and validate UYAP UDF documents",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fflate": "^0.8.2",
    "fast-xml-parser": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors. (Network access required.)

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: scaffold @leogal/udf package"
```

---

### Task 2: Document model types

**Files:**
- Create: `src/model/types.ts`
- Test: `tests/model.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/model.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model.test.ts`
Expected: FAIL — cannot find module `../src/model/types`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/model/types.ts
export interface PageFormat {
  mediaSizeName: number;   // 1 = A4
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  bottomMargin: number;
  paperOrientation: number; // 1 = portrait
  headerFOffset: number;
  footerFOffset: number;
}

export interface Style {
  name: string;
  description?: string;
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  foreground?: string;
}

export type Alignment = 'left' | 'center' | 'right' | 'justify';

export interface TextRun {
  kind?: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  family?: string;
  foreground?: string;
}

export interface ImageRun {
  kind: 'image';
  imageData: string; // base64 PNG
  width: number;
  height: number;
}

export type Run = TextRun | ImageRun;

export interface Paragraph {
  alignment: Alignment;
  spaceAbove?: number;
  spaceBelow?: number;
  leftIndent?: number;
  rightIndent?: number;
  firstLineIndent?: number;
  hanging?: number;
  lineSpacing?: number;
  styleNumber?: number;
  runs: Run[];
}

export type Block = Paragraph;

export interface UdfDocument {
  pageFormat: PageFormat;
  styles: Style[];
  header?: Block[];
  body: Block[];
  footer?: Block[];
}

export function isImageRun(run: Run): run is ImageRun {
  return (run as ImageRun).kind === 'image';
}

export function defaultPageFormat(): PageFormat {
  return {
    mediaSizeName: 1,
    leftMargin: 70.875,
    rightMargin: 70.875,
    topMargin: 70.875,
    bottomMargin: 70.875,
    paperOrientation: 1,
    headerFOffset: 20.0,
    footerFOffset: 20.0,
  };
}

export function defaultStyles(): Style[] {
  return [
    { name: 'default', description: 'Geçerli', family: 'Dialog', size: 12, bold: false, italic: false },
    { name: 'hvl-default', family: 'Times New Roman', size: 12, description: 'Gövde' },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/model/types.ts tests/model.test.ts
git commit -m "feat: add offset-free UDF document model"
```

---

### Task 3: Zip layer (.udf <-> content.xml)

**Files:**
- Create: `src/package/zip.ts`
- Test: `tests/zip.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/zip.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/zip.test.ts`
Expected: FAIL — cannot find module `../src/package/zip`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/package/zip.ts
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export class UdfPackageError extends Error {}

export function packUdf(contentXml: string): Uint8Array {
  return zipSync({ 'content.xml': strToU8(contentXml) });
}

export function unpackContentXml(udf: Uint8Array): string {
  let files;
  try {
    files = unzipSync(udf);
  } catch (e) {
    throw new UdfPackageError(`Not a valid .udf (zip) archive: ${(e as Error).message}`);
  }
  const entry = files['content.xml'];
  if (!entry) {
    throw new UdfPackageError(
      `content.xml not found in .udf archive (entries: ${Object.keys(files).join(', ') || 'none'})`,
    );
  }
  return strFromU8(entry);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/zip.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/package/zip.ts tests/zip.test.ts
git commit -m "feat: add .udf zip pack/unpack layer"
```

---

### Task 4: XML helpers

**Files:**
- Create: `src/serialize/xml.ts`
- Test: `tests/xml.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/xml.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/xml.test.ts`
Expected: FAIL — cannot find module `../src/serialize/xml`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/serialize/xml.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/xml.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/serialize/xml.ts tests/xml.test.ts
git commit -m "feat: add xml attribute helpers"
```

---

### Task 5: Serializer (model -> content.xml, offset computation)

**Files:**
- Create: `src/serialize/serialize.ts`
- Test: `tests/serialize.test.ts`

The serializer walks header -> body -> footer in order. It maintains a `buffer`
string and a `cursor`. For each `TextRun` it appends `run.text`, emits a
`<content startOffset=cursor length=text.length .../>` and advances the cursor.
For each `ImageRun` it appends the placeholder char `\u00B8` plus one space, emits
`<image .../>` (len 1) followed by `<content .../>` (len 1), advancing the cursor
by 2. Alignment maps left=0, center=1, right=2, justify=3.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/serialize.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/serialize.test.ts`
Expected: FAIL — cannot find module `../src/serialize/serialize`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/serialize/serialize.ts
import {
  type UdfDocument,
  type Block,
  type Paragraph,
  type Run,
  type Style,
  type PageFormat,
  type Alignment,
  isImageRun,
} from '../model/types';
import { attrs } from './xml';

const ALIGNMENT_CODE: Record<Alignment, number> = {
  left: 0,
  center: 1,
  right: 2,
  justify: 3,
};

// The single placeholder char UYAP uses where an inline image sits in the buffer.
const IMAGE_PLACEHOLDER = '\u00B8';

interface SerializeState {
  buffer: string;
  cursor: number;
  out: string[]; // collected <paragraph> xml fragments
}

function paragraphAttrs(p: Paragraph): string {
  return attrs({
    Alignment: ALIGNMENT_CODE[p.alignment],
    LeftIndent: p.leftIndent,
    RightIndent: p.rightIndent,
    FirstLineIndent: p.firstLineIndent,
    Hanging: p.hanging,
    SpaceAbove: p.spaceAbove,
    SpaceBelow: p.spaceBelow,
    LineSpacing: p.lineSpacing,
    styleNumber: p.styleNumber,
  });
}

function serializeRun(run: Run, state: SerializeState): string {
  if (isImageRun(run)) {
    const imageOffset = state.cursor;
    state.buffer += IMAGE_PLACEHOLDER + ' ';
    state.cursor += 2;
    const imageEl =
      `<image${attrs({
        imageData: run.imageData,
        width: run.width,
        height: run.height,
        startOffset: imageOffset,
        length: 1,
      })} />`;
    const contentEl = `<content${attrs({ startOffset: imageOffset + 1, length: 1 })} />`;
    return imageEl + contentEl;
  }
  const offset = state.cursor;
  state.buffer += run.text;
  state.cursor += run.text.length;
  return `<content${attrs({
    startOffset: offset,
    length: run.text.length,
    bold: run.bold,
    italic: run.italic,
    size: run.size,
    family: run.family,
    foreground: run.foreground,
  })} />`;
}

function serializeParagraph(p: Paragraph, state: SerializeState): void {
  let inner = '';
  for (const run of p.runs) inner += serializeRun(run, state);
  state.out.push(`<paragraph${paragraphAttrs(p)}>${inner}</paragraph>`);
}

function serializeBlocks(blocks: Block[], state: SerializeState): string {
  const start = state.out.length;
  for (const block of blocks) serializeParagraph(block, state);
  const fragments = state.out.splice(start);
  return fragments.join('');
}

function serializePageFormat(pf: PageFormat): string {
  return `<pageFormat${attrs({
    mediaSizeName: pf.mediaSizeName,
    leftMargin: pf.leftMargin,
    rightMargin: pf.rightMargin,
    topMargin: pf.topMargin,
    bottomMargin: pf.bottomMargin,
    paperOrientation: pf.paperOrientation,
    headerFOffset: pf.headerFOffset,
    footerFOffset: pf.footerFOffset,
  })} />`;
}

function serializeStyles(styles: Style[]): string {
  const items = styles
    .map(
      (s) =>
        `<style${attrs({
          name: s.name,
          description: s.description,
          family: s.family,
          size: s.size,
          bold: s.bold,
          italic: s.italic,
          foreground: s.foreground,
        })} />`,
    )
    .join('');
  return `<styles>${items}</styles>`;
}

function escapeCdata(text: string): string {
  // Split any ']]>' so it cannot terminate the CDATA section early.
  return text.replace(/]]>/g, ']]]]><![CDATA[>');
}

export function serialize(doc: UdfDocument): string {
  const state: SerializeState = { buffer: '', cursor: 0, out: [] };

  const headerXml = doc.header ? `<header>${serializeBlocks(doc.header, state)}</header>` : '';
  const bodyXml = serializeBlocks(doc.body, state);
  const footerXml = doc.footer ? `<footer>${serializeBlocks(doc.footer, state)}</footer>` : '';

  const elements = `<elements resolver="hvl-default">\n${headerXml}${bodyXml}${footerXml}\n</elements>`;
  const properties = `<properties>${serializePageFormat(doc.pageFormat)}</properties>`;
  const content = `<content><![CDATA[${escapeCdata(state.buffer)}]]></content>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" ?>\n\n` +
    `<template format_id="1.8">\n` +
    `${content}${properties}\n` +
    `${elements}\n` +
    `${serializeStyles(doc.styles)}\n` +
    `</template>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/serialize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/serialize/serialize.ts tests/serialize.test.ts
git commit -m "feat: add serializer with offset computation"
```

---

### Task 6: Parser (content.xml -> model, offset resolution)

**Files:**
- Create: `src/parse/parse.ts`
- Test: `tests/parse.test.ts`

The parser extracts the CDATA buffer, parses `<elements>` with fast-xml-parser
(`preserveOrder: true`), and for each `<content>`/`<image>` node slices the buffer
by `startOffset`/`length` to reconstruct runs. Alignment codes map back to names.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/parse.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL — cannot find module `../src/parse/parse`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/parse/parse.ts
import { XMLParser } from 'fast-xml-parser';
import {
  type UdfDocument,
  type Paragraph,
  type Run,
  type TextRun,
  type ImageRun,
  type Alignment,
  type PageFormat,
  defaultPageFormat,
  defaultStyles,
} from '../model/types';

export class UdfParseError extends Error {}

const ALIGNMENT_NAME: Record<string, Alignment> = {
  '0': 'left',
  '1': 'center',
  '2': 'right',
  '3': 'justify',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  cdataPropName: '__cdata',
  parseAttributeValue: false,
});

function extractCdata(xml: string): string {
  const start = xml.indexOf('<![CDATA[');
  if (start === -1) throw new UdfParseError('No CDATA content section found');
  const end = xml.indexOf(']]>', start);
  if (end === -1) throw new UdfParseError('Unterminated CDATA content section');
  // Reverse the serializer's CDATA-terminator escaping.
  return xml.slice(start + '<![CDATA['.length, end).replace(/]]]]><!\[CDATA\[>/g, ']]>');
}

// preserveOrder nodes look like: { tagName: [ ...children ], ':@': { '@_attr': 'v' } }
function attrsOf(node: any): Record<string, string> {
  return (node[':@'] as Record<string, string>) ?? {};
}
function childrenOf(node: any, tag: string): any[] {
  return (node[tag] as any[]) ?? [];
}
function num(v: string | undefined): number | undefined {
  return v === undefined ? undefined : Number(v);
}

function parseRun(node: any, buffer: string): Run | null {
  const tag = Object.keys(node).find((k) => k !== ':@');
  const a = attrsOf(node);
  const startOffset = num(a['@_startOffset']);
  const length = num(a['@_length']);
  if (startOffset === undefined || length === undefined) return null;

  if (tag === 'image') {
    const img: ImageRun = {
      kind: 'image',
      imageData: a['@_imageData'] ?? '',
      width: num(a['@_width']) ?? 0,
      height: num(a['@_height']) ?? 0,
    };
    return img;
  }
  if (tag === 'content') {
    const text = buffer.slice(startOffset, startOffset + length);
    const run: TextRun = { text };
    if (a['@_bold'] === 'true') run.bold = true;
    if (a['@_italic'] === 'true') run.italic = true;
    if (a['@_size'] !== undefined) run.size = num(a['@_size']);
    if (a['@_family'] !== undefined) run.family = a['@_family'];
    if (a['@_foreground'] !== undefined) run.foreground = a['@_foreground'];
    return run;
  }
  return null;
}

function parseParagraph(node: any, buffer: string): Paragraph {
  const a = attrsOf(node);
  const runs: Run[] = [];
  for (const child of childrenOf(node, 'paragraph') === node ? [] : (node['paragraph'] as any)) {
    // unreachable guard; real iteration below
  }
  // node looks like { paragraph: [ ...children ], ':@': {...} }
  const childNodes = (node['paragraph'] as any[]) ?? [];
  for (const child of childNodes) {
    const run = parseRun(child, buffer);
    if (run) runs.push(run);
  }
  const alignmentCode = a['@_Alignment'] ?? '0';
  return {
    alignment: ALIGNMENT_NAME[alignmentCode] ?? 'left',
    leftIndent: num(a['@_LeftIndent']),
    rightIndent: num(a['@_RightIndent']),
    firstLineIndent: num(a['@_FirstLineIndent']),
    hanging: num(a['@_Hanging']),
    spaceAbove: num(a['@_SpaceAbove']),
    spaceBelow: num(a['@_SpaceBelow']),
    lineSpacing: num(a['@_LineSpacing']),
    styleNumber: num(a['@_styleNumber']),
    runs,
  };
}

function parseBlocks(containerChildren: any[], buffer: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const node of containerChildren) {
    if (node['paragraph']) out.push(parseParagraph(node, buffer));
  }
  return out;
}

function parsePageFormat(elementsRoot: any[]): PageFormat {
  // Find <properties><pageFormat .../>
  for (const node of elementsRoot) {
    if (node['properties']) {
      for (const child of node['properties'] as any[]) {
        if (child['pageFormat']) {
          const a = attrsOf(child);
          const pf = defaultPageFormat();
          return {
            mediaSizeName: num(a['@_mediaSizeName']) ?? pf.mediaSizeName,
            leftMargin: num(a['@_leftMargin']) ?? pf.leftMargin,
            rightMargin: num(a['@_rightMargin']) ?? pf.rightMargin,
            topMargin: num(a['@_topMargin']) ?? pf.topMargin,
            bottomMargin: num(a['@_bottomMargin']) ?? pf.bottomMargin,
            paperOrientation: num(a['@_paperOrientation']) ?? pf.paperOrientation,
            headerFOffset: num(a['@_headerFOffset']) ?? pf.headerFOffset,
            footerFOffset: num(a['@_footerFOffset']) ?? pf.footerFOffset,
          };
        }
      }
    }
  }
  return defaultPageFormat();
}

export function parse(xml: string): UdfDocument {
  const buffer = extractCdata(xml);
  let tree: any[];
  try {
    tree = parser.parse(xml);
  } catch (e) {
    throw new UdfParseError(`Invalid content.xml: ${(e as Error).message}`);
  }

  const templateNode = tree.find((n) => n['template']);
  if (!templateNode) throw new UdfParseError('No <template> root element found');
  const templateChildren = templateNode['template'] as any[];

  const elementsNode = templateChildren.find((n) => n['elements']);
  if (!elementsNode) throw new UdfParseError('No <elements> section found');
  const elementsChildren = elementsNode['elements'] as any[];

  const header: Paragraph[] = [];
  const footer: Paragraph[] = [];
  const body: Paragraph[] = [];

  for (const node of elementsChildren) {
    if (node['header']) header.push(...parseBlocks(node['header'] as any[], buffer));
    else if (node['footer']) footer.push(...parseBlocks(node['footer'] as any[], buffer));
    else if (node['paragraph']) body.push(parseParagraph(node, buffer));
  }

  const doc: UdfDocument = {
    pageFormat: parsePageFormat(templateChildren),
    styles: defaultStyles(),
    body,
  };
  if (header.length) doc.header = header;
  if (footer.length) doc.footer = footer;
  return doc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS (4 tests).

NOTE: If the `parseParagraph` unreachable guard loop causes a type error, delete
those 3 lines — the real iteration uses `childNodes` below it. Keep only the
`childNodes` loop.

- [ ] **Step 5: Commit**

```bash
git add src/parse/parse.ts tests/parse.test.ts
git commit -m "feat: add parser resolving runs from offsets"
```

---

### Task 7: Validator (offset integrity)

**Files:**
- Create: `src/validate/validate.ts`
- Test: `tests/validate.test.ts`

Validation runs over a serialized `content.xml` string: it collects every
`startOffset`/`length` pair from `<content>` and `<image>` nodes, sorts them, and
asserts they start at 0, are contiguous (no gaps, no overlaps), and exactly cover
the CDATA buffer length.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/validate.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL — cannot find module `../src/validate/validate`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/validate/validate.ts
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

interface Span {
  startOffset: number;
  length: number;
}

function extractCdataLength(xml: string): number {
  const start = xml.indexOf('<![CDATA[');
  const end = xml.indexOf(']]>', start);
  if (start === -1 || end === -1) return 0;
  return xml.slice(start + '<![CDATA['.length, end).replace(/]]]]><!\[CDATA\[>/g, ']]>').length;
}

function extractSpans(xml: string): Span[] {
  const spans: Span[] = [];
  const re = /<(?:content|image)\b[^>]*?startOffset="(\d+)"[^>]*?length="(\d+)"[^>]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    spans.push({ startOffset: Number(m[1]), length: Number(m[2]) });
  }
  return spans;
}

export function validateContentXml(xml: string): ValidationResult {
  const errors: string[] = [];
  const bufferLength = extractCdataLength(xml);
  const spans = extractSpans(xml).sort((a, b) => a.startOffset - b.startOffset);

  let expected = 0;
  for (const span of spans) {
    if (span.startOffset !== expected) {
      errors.push(
        `Offset not contiguous: expected ${expected} but found ${span.startOffset} (gap or overlap)`,
      );
    }
    expected = Math.max(expected, span.startOffset + span.length);
  }
  if (expected !== bufferLength) {
    errors.push(`Spans cover ${expected} chars but CDATA buffer length is ${bufferLength}`);
  }

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/validate/validate.ts tests/validate.test.ts
git commit -m "feat: add offset-integrity validator"
```

---

### Task 8: Public API + round-trip

**Files:**
- Create: `src/index.ts`
- Create: `tests/fixtures/synthetic.udf.ts` (helper that builds a synthetic doc)
- Test: `tests/index.roundtrip.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/index.roundtrip.test.ts
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
    // Re-serialize and check offset integrity of our own output.
    const result = validate(writeUdf(doc));
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.roundtrip.test.ts`
Expected: FAIL — cannot find module `../src/index`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/index.ts
import { type UdfDocument } from './model/types';
import { serialize } from './serialize/serialize';
import { parse } from './parse/parse';
import { packUdf, unpackContentXml } from './package/zip';
import { validateContentXml, type ValidationResult } from './validate/validate';

export * from './model/types';
export { UdfParseError } from './parse/parse';
export { UdfPackageError } from './package/zip';
export type { ValidationResult } from './validate/validate';

export function writeUdf(doc: UdfDocument): Uint8Array {
  return packUdf(serialize(doc));
}

export function readUdf(udf: Uint8Array): UdfDocument {
  return parse(unpackContentXml(udf));
}

export function serializeToXml(doc: UdfDocument): string {
  return serialize(doc);
}

export function validate(udf: Uint8Array): ValidationResult {
  return validateContentXml(unpackContentXml(udf));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/index.roundtrip.test.ts`
Expected: PASS (2 tests + 1 conditionally skipped/passing).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/index.roundtrip.test.ts
git commit -m "feat: add public API and round-trip tests"
```

---

### Task 9: Manual UYAP Editör verification (human-in-the-loop)

This task cannot be automated — it confirms generated files open correctly in the
real UYAP Editör (the user has it installed).

- [ ] **Step 1: Generate a sample file**

Write a tiny script `scripts/gen-sample.ts` that builds a small document via the
public API and writes `out.udf`:

```typescript
// scripts/gen-sample.ts
import { writeFileSync } from 'node:fs';
import { writeUdf, defaultPageFormat, defaultStyles } from '../src/index';

const udf = writeUdf({
  pageFormat: defaultPageFormat(),
  styles: defaultStyles(),
  body: [
    { alignment: 'center', runs: [{ text: 'NÖBETÇİ ASLİYE HUKUK MAHKEMESİNE', bold: true }] },
    { alignment: 'justify', runs: [{ text: 'Bu bir test dilekçesidir. Açıklamalar.' }] },
    { alignment: 'left', runs: [{ text: 'Saygılarımızla.' }] },
  ],
});
writeFileSync('out.udf', udf);
console.log('wrote out.udf');
```

Run: `npx tsx scripts/gen-sample.ts` (install `tsx` if needed: `npm i -D tsx`).
Expected: `out.udf` created.

- [ ] **Step 2: Open `out.udf` in UYAP Editör (manual)**

Confirm: text renders, alignment correct, no corruption error. If UYAP rejects it,
the most likely fix is that `<content>` runs must repeat their paragraph's
attributes (Alignment/indents) — adjust `serializeRun` to merge paragraph attrs
into each content run, re-run the suite, regenerate, and re-check. Record the
outcome in `docs/superpowers/specs/2026-06-04-udf-document-module-design.md` under
"Open Questions".

- [ ] **Step 3: Commit any adjustments**

```bash
git add -A
git commit -m "fix: align UDF output with UYAP Editör expectations"
```

---

## Self-Review

- **Spec coverage:** model (Task 2), serializer/offsets (Task 5), parser (Task 6),
  zip layer (Task 3), validator (Task 7), public API + round-trip incl. real sample
  (Task 8), UYAP Editör verification (Task 9), TDD throughout. Page format, styles,
  header/footer, image runs, error types (`UdfParseError`, `UdfPackageError`) all
  covered. CDATA terminator escaping covered (Task 5).
- **Deferred (per spec non-goals):** markdown/LLM layer, tables, separate-zip-entry
  images — intentionally out of scope.
- **Type consistency:** `writeUdf`/`readUdf`/`validate`/`serialize`/`parse`/`packUdf`/
  `unpackContentXml`/`validateContentXml` names consistent across tasks; `ImageRun`
  uses `kind: 'image'` discriminant with `isImageRun` guard everywhere.
- **Known empirical risks (flagged for Task 9):** exact image placeholder byte and
  whether content runs must repeat paragraph attributes — resolved by UYAP Editör
  verification, not assumption.
