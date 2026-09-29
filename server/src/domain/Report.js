/**
 * UML class: Report
 *   reportId, reportType, generatedBy, generatedAt, parameters, filePath
 *   + generate(): void
 *   + exportPDF(): void
 *   + exportCSV(): void
 * SRS 4.7: Dashboard.Occupancy, Dashboard.Revenue, Dashboard.Cancellations, Dashboard.Export (PDF / CSV)
 * DFD: 6.0 Reporting & Administration -> D7 Reports & Analytics
 */
import { PdfDocument } from '../lib/pdf.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class Report {
  /** exportCSV(): every table of the report, separated by a blank line. */
  static exportCSV(report) {
    const out = [`# ${report.title}`, `# Generated ${new Date(report.generatedAt).toISOString()} | ${Object.entries(report.parameters || {}).map(([k, v]) => `${k}=${v}`).join(' ')}`];
    for (const table of report.tables) {
      out.push('', `# ${table.title}`, table.columns.map((c) => csvCell(c.label)).join(','));
      for (const row of table.rows) out.push(table.columns.map((c) => csvCell(row[c.key])).join(','));
    }
    return out.join('\n');
  }

  /** exportPDF() */
  static exportPDF(report, hotelName) {
    const doc = new PdfDocument();
    doc.rect(0, 780, 595.28, 62, [0.07, 0.1, 0.19]);
    doc.text(report.title, 50, 812, { size: 17, bold: true, color: [1, 1, 1] });
    doc.text(`${hotelName} - generated ${new Date(report.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`, 50, 794, { size: 9, color: [0.8, 0.83, 0.9] });
    doc.y = 755;
    const params = Object.entries(report.parameters || {}).map(([k, v]) => `${k}: ${v}`).join('   ');
    if (params) { doc.text(params, 50, doc.y, { size: 9, color: [0.4, 0.45, 0.55] }); doc.y -= 22; }
    if (report.summary?.length) {
      let x = 50;
      for (const s of report.summary.slice(0, 4)) {
        doc.rect(x, doc.y - 30, 118, 40, [0.95, 0.96, 0.98]);
        doc.text(s.label, x + 8, doc.y - 2, { size: 7, color: [0.4, 0.45, 0.55] });
        doc.text(String(s.value), x + 8, doc.y - 20, { size: 13, bold: true });
        x += 124;
      }
      doc.y -= 60;
    }
    for (const table of report.tables) {
      if (doc.y < 120) doc.addPage();
      doc.text(table.title, 50, doc.y, { size: 11, bold: true });
      doc.y -= 20;
      const width = 495 / table.columns.length;
      doc.table(table.columns.map((c) => ({ header: c.label, width, align: c.numeric ? 'right' : 'left' })), table.rows.map((r) => table.columns.map((c) => r[c.key])));
      doc.y -= 18;
    }
    return doc.toBuffer();
  }
}
