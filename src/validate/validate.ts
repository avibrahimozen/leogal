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
    if (span.startOffset > expected) {
      errors.push(`Offset gap: expected ${expected} but next span starts at ${span.startOffset}`);
    } else if (span.startOffset < expected) {
      errors.push(
        `Offset overlap: span starts at ${span.startOffset} but previous spans already cover through ${expected}`,
      );
    }
    expected = Math.max(expected, span.startOffset + span.length);
  }
  if (expected !== bufferLength) {
    errors.push(`Spans cover ${expected} chars but CDATA buffer length is ${bufferLength}`);
  }

  return { ok: errors.length === 0, errors };
}
