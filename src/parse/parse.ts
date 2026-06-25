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

function parsePageFormat(templateChildren: any[]): PageFormat {
  // Find <properties><pageFormat .../>
  for (const node of templateChildren) {
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
