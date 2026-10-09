// A minimal one-page PDF writer for pay stubs. Workers have no filesystem or
// native PDF library, and a pay stub is a handful of text lines, so this
// writes PDF 1.4 by hand with the built-in Helvetica fonts (no embedding).

export interface PdfLine {
  text: string;
  x: number;
  /** Distance from the top of the page, in points. */
  y: number;
  size?: number;
  bold?: boolean;
  /** Right-aligns the text so it ends at x (approximate Helvetica widths). */
  alignRight?: boolean;
}

export interface PdfRule {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;

/** PDF string literal escaping, limited to printable Latin-1. */
function pdfString(text: string): string {
  const latin1 = text.replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  return `(${latin1.replace(/[\\()]/g, (char) => `\\${char}`)})`;
}

/** Rough Helvetica width: good enough to right-align numbers in a column. */
function approximateWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const char of text) {
    if (/[0-9$.,]/.test(char)) units += char === "." || char === "," ? 278 : 556;
    else if (char === " ") units += 278;
    else if (/[A-Z]/.test(char)) units += 667;
    else units += 520;
  }
  return (units * size * (bold ? 1.05 : 1)) / 1000;
}

export function buildPdf(title: string, lines: PdfLine[], rules: PdfRule[] = []): Uint8Array {
  const content: string[] = ["0.2 0.13 0.35 RG 0.75 w"];
  for (const rule of rules) {
    content.push(`${rule.x1} ${PAGE_HEIGHT - rule.y1} m ${rule.x2} ${PAGE_HEIGHT - rule.y2} l S`);
  }
  for (const line of lines) {
    const size = line.size ?? 10;
    const font = line.bold ? "F2" : "F1";
    const x = line.alignRight ? line.x - approximateWidth(line.text, size, Boolean(line.bold)) : line.x;
    content.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${PAGE_HEIGHT - line.y} Td ${pdfString(line.text)} Tj ET`);
  }
  const stream = content.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer (Talon) >>`,
  ];

  // Every character is Latin-1 (see pdfString), so string length = byte length.
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}
