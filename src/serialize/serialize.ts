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
const IMAGE_PLACEHOLDER = '¸';

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
