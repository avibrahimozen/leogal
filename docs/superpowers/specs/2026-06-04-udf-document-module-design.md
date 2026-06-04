# UDF Document Module — Design Spec

**Date:** 2026-06-04
**Sub-project:** #1 of the Leogal UYAP agent
**Status:** Approved (design), pending implementation plan

## Context

Leogal is an AI/LLM agent that acts as a lawyer's clerk: it drafts UYAP UDF
petitions, e-signs them, and submits them to UYAP via browser automation. The
agent runs locally on a clerk/office machine (where the e-imza token is plugged
in); lawyers instruct and approve it remotely through a web panel.

Full system decomposition (build order):

1. **UDF document generation module** ← THIS SPEC
2. Claude petition drafting
3. E-signature module (PKCS#11 smart card + mobile signature)
4. UYAP browser automation (Playwright)
5. Local agent runtime + remote lawyer web panel
6. Packaging / distribution (Windows + Mac)

This spec covers only sub-project #1. Each sub-project gets its own
spec → plan → implementation cycle.

### Confirmed global decisions
- Agent type: AI/LLM agent (Claude API, cloud)
- UYAP submission: browser automation (Playwright)
- E-signature: smart card PKCS#11 (primary) + mobile signature + e-Devlet login
- Topology: clerk machine local (agent + token), lawyer remote via web panel
- Stack: Node.js + TypeScript
- Cross-platform target: Windows + Mac

## Goal

A pure TypeScript library, `@leogal/udf`, that can **read, write, and validate**
UYAP `.udf` documents. It is offline, requires no token or external service, and
is verifiable against real samples and the UYAP Editör desktop app. Downstream
sub-projects (drafting, agent runtime) depend on it.

Non-goals (deferred):
- LLM/markdown → model conversion layer (sub-project #2)
- Tables and advanced UYAP elements (v1 supports paragraphs, runs, images,
  header/footer only)
- Separate-zip-entry images (v1 uses inline base64, matching observed samples)

## UDF Format (reverse-engineered, verified from sample)

Verified from `Samples/İsmail hakkı çelik dava dilekçesi son.udf`.

- `.udf` = ZIP archive. The sample contains a single `content.xml` entry; images
  are inline as base64, not separate zip entries.
- `content.xml`:
  - `<?xml version="1.0" encoding="UTF-8" ?>`
  - `<template format_id="1.8">` root.
  - `<content><![CDATA[ ...ENTIRE document as one flat plain-text buffer... ]]></content>`
    Images occupy placeholder char(s) in the buffer (e.g. a leading `0xB8` / `¸`
    byte for the header image at offset 0).
  - `<properties><pageFormat mediaSizeName="1" leftMargin="70.875" ...
    paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>`
    (`mediaSizeName=1` → A4, `paperOrientation=1` → portrait, margins in pt).
  - `<elements resolver="hvl-default">` = the FORMATTING LAYER, separate from text:
    - optional `<header>`, ordered `<paragraph>` nodes, optional `<footer>`.
    - each `<paragraph>` carries paragraph-level attrs (Alignment, LeftIndent,
      RightIndent, FirstLineIndent, Hanging, SpaceAbove, SpaceBelow, LineSpacing,
      styleNumber) and contains 1+ `<content startOffset="X" length="Y" .../>`
      runs. Each run references a substring of the CDATA buffer by offset+length
      and carries run-level style attrs (bold, italic, size, family, foreground).
    - `<image imageData="<base64>" width height startOffset length />` represents
      an inline image; observed pattern in header: an `<image ... length="1">`
      immediately followed by a `<content ... length="1">` (image occupies 2
      buffer positions).
  - `<styles>`: `<style name="default" .../>` and
    `<style name="hvl-default" family="Times New Roman" size="12" .../>`.
- Alignment values: `0`=left, `1`=center, `3`=justify (`2`=right, to confirm).
- **Core complexity:** offsets must be exact, contiguous, gapless, and cover the
  full buffer. Empty paragraphs are represented by a `length="1"` content
  (invisible newline). Generating a valid offset mapping is the hard part.

The user has UYAP Editör installed for visual verification of generated files,
and will provide more sample `.udf` files over time to refine format handling.

## Approach

Chosen: **Structured Document Model** (offset-free semantic model) + serializer
(auto-computes offsets) + parser + zip layer + validator. The offset complexity
is hidden entirely inside the module; callers never see offsets. Round-trip
tested against the real sample.

(Rejected: template/token replacement — offsets shift on variable-length text;
markdown→UDF — lossy for rich UYAP styles, deferred as a layer in sub-project #2.)

## Architecture

Package `@leogal/udf`, pure TypeScript, offline, no external service/token.

```
@leogal/udf
├── model/        Document model types — NO offsets, semantic structure only
├── serialize/    model → content.xml (offset computation lives here)
├── parse/        content.xml → model (offset resolution lives here)
├── package/      .udf zip read/write (zip layer)
├── validate/     offset integrity + round-trip validation
└── index.ts      Public API: readUdf(buf), writeUdf(doc), validate(doc)
```

**Write flow:** `UdfDocument` → serializer builds the CDATA text buffer and the
`<elements>` tree in a single pass, computing offsets → `content.xml` → zip →
`.udf` Buffer.

**Read flow:** `.udf` Buffer → unzip → `content.xml` → parser assigns buffer
substrings to runs using offsets → `UdfDocument`.

Zip library: `fflate` (pure JS, dependency-free).

## Data Model (offset-free, semantic)

```typescript
interface UdfDocument {
  pageFormat: PageFormat;        // A4, margins, orientation
  styles: Style[];               // default + hvl-default
  header?: Block[];
  body: Block[];
  footer?: Block[];
}

type Block = Paragraph;          // tables deferred

interface Paragraph {
  alignment: 'left' | 'center' | 'right' | 'justify';
  spaceAbove?: number; spaceBelow?: number;
  leftIndent?: number; rightIndent?: number;
  firstLineIndent?: number; hanging?: number;
  lineSpacing?: number;
  styleNumber?: number;          // UYAP list/numbering styles
  runs: Run[];
}

type Run = TextRun | ImageRun;

interface TextRun {
  text: string;                  // offset computed by serializer
  bold?: boolean; italic?: boolean;
  size?: number; family?: string;
  foreground?: string;
}

interface ImageRun {
  imageData: string;             // base64 PNG
  width: number; height: number;
}
```

Key principle: **the model contains no offsets.** Callers provide only semantic
structure; the serializer computes offsets in one authoritative place, making
offset errors impossible at the API boundary.

## Offset Computation (heart of the module)

Single pass building both the text buffer and `<elements>`:

1. Start with `buffer = ""`, `cursor = 0`.
2. In order header → body → footer, for each paragraph, for each run:
   - `TextRun`: `buffer += run.text`; emit
     `<content startOffset=cursor length=run.text.length ...style/>`;
     `cursor += run.text.length`.
   - `ImageRun`: append a single placeholder char to buffer (matching the sample's
     `0xB8`-style byte); emit the `<image>` + following `<content>` pair per the
     observed header pattern (image len 1, content len 1); advance cursor by 2.
3. `buffer` → CDATA; collected elements → `<elements>`. Offsets are contiguous
   and complete by construction.

Ambiguities to pin down during implementation by parsing the real sample +
round-trip:
- Exact placeholder byte value and the image offset/length pattern.
- `styleNumber` (list/numbering) behavior and which paragraph attrs it triggers.
- Empty-paragraph representation (`length="1"` invisible newline observed).

## Validation

1. **Structural:** offsets start at 0, are contiguous, gapless, cover the entire
   buffer; each run length matches its text; alignment/style values in valid
   range.
2. **Round-trip:** `writeUdf(readUdf(sample))` is semantically equal to the
   sample. Generated files are also opened manually in UYAP Editör for visual
   confirmation.

## Error Handling

- Parser throws `UdfParseError` (with offset context) on malformed/missing
  offsets.
- Serializer throws `UdfValidationError` on invalid model input (e.g. negative
  indent).
- No silent or approximate behavior — if UYAP would reject the file, the module
  must surface a clear error first.

## Test Strategy (TDD)

- **Real-sample fixture:** parse `Samples/...udf` → assert expected model fields
  (party paragraphs, header image, footer).
- **Round-trip test:** sample → model → udf → model; the two models are equal.
- **Unit tests:** offset computation (multi-run paragraph, image, empty
  paragraph), zip read/write, validator positive/negative cases.
- **Golden test:** a small hand-built model → generated `content.xml` matches
  expected offsets.

## Open Questions / Follow-ups

- ~~Confirm `2`=right alignment.~~ **Confirmed.** Parsing the real sample
  (`İsmail hakkı çelik dava dilekçesi son.udf`) found 3 paragraphs with
  `Alignment="2"`, all right-aligned. Code `2` = right is correct.
- Confirm whether some `.udf` files use separate zip entries for images (gather
  more samples). v1 assumes inline base64 — verified working: the real sample's
  single header image round-trips as inline base64.
- `styleNumber` semantics need more samples to generalize.

### Real-sample validation (Task 8)

The module was exercised against the real git-ignored sample end-to-end:
- `readUdf` parsed it without error: 79 body paragraphs, 1 header paragraph
  (with image), 3 footer paragraphs, 213 text runs, 1 image, 15,737 chars.
- All four alignments observed (center 6, left 26, justify 48, right 3).
- `validate(writeUdf(doc))` passed — our re-serialized offsets are contiguous,
  gapless, and cover the full buffer.
