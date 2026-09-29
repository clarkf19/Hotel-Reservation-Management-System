/**
 * Minimal dependency-free PDF writer used for invoices (Invoice.generatePDF) and
 * report export (Report.exportPDF, Dashboard.Export). Produces A4 pages with
 * Helvetica text, simple lines and filled rectangles.
 */
const A4 = { w: 595.28, h: 841.89 };

function esc(text) {
  return String(text)
    .replace(/[₹]/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, (c) => ({ '•': '*', '→': '->', '—': '-', '–': '-', '·': '-' }[c] ?? '?'))
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export class PdfDocument {
  constructor() {
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = A4.h - 50;
    return this;
  }

  text(str, x, y, { size = 10, bold = false, color = [0.1, 0.12, 0.18] } = {}) {
    this.ops.push(`${color.join(' ')} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(str)}) Tj ET`);
    return this;
  }

  rect(x, y, w, h, color = [0.95, 0.95, 0.97]) {
    this.ops.push(`${color.join(' ')} rg ${x} ${y} ${w} ${h} re f`);
    return this;
  }

  line(x1, y1, x2, y2, color = [0.8, 0.82, 0.86]) {
    this.ops.push(`${color.join(' ')} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`);
    return this;
  }

  /** Approximate Helvetica width for right-alignment. */
  static width(str, size) {
    return String(str).length * size * 0.5;
  }

  textRight(str, xRight, y, opts = {}) {
    return this.text(str, xRight - PdfDocument.width(esc(str), opts.size ?? 10), y, opts);
  }

  /** Simple table with automatic page breaks. columns: [{ header, width, align }] */
  table(columns, rows, { x = 50, rowHeight = 18, size = 9 } = {}) {
    const header = () => {
      this.rect(x, this.y - 5, columns.reduce((s, c) => s + c.width, 0), rowHeight, [0.12, 0.16, 0.27]);
      let cx = x;
      for (const c of columns) {
        if (c.align === 'right') this.textRight(c.header, cx + c.width - 6, this.y, { size, bold: true, color: [1, 1, 1] });
        else this.text(c.header, cx + 6, this.y, { size, bold: true, color: [1, 1, 1] });
        cx += c.width;
      }
      this.y -= rowHeight;
    };
    header();
    rows.forEach((row, i) => {
      if (this.y < 60) { this.addPage(); header(); }
      if (i % 2 === 1) this.rect(x, this.y - 5, columns.reduce((s, c) => s + c.width, 0), rowHeight, [0.96, 0.97, 0.98]);
      let cx = x;
      columns.forEach((c, j) => {
        const val = String(row[j] ?? '');
        const clipped = val.length > c.width / (size * 0.5) ? val.slice(0, Math.floor(c.width / (size * 0.5)) - 1) + '.' : val;
        if (c.align === 'right') this.textRight(clipped, cx + c.width - 6, this.y, { size });
        else this.text(clipped, cx + 6, this.y, { size });
        cx += c.width;
      });
      this.y -= rowHeight;
    });
    return this;
  }

  toBuffer() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalogId = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`));
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, 'latin1');
  }
}
