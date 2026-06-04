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
