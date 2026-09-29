/**
 * UML class: Invoice
 *   invoiceId, reservationId, invoiceNumber, issueDate, totalAmount, status
 *   + generatePDF(): void
 * Relationship: Reservation 1 --has--> 0..1 Invoice
 * SRS: Invoice.Generate (itemised invoice generated and e-mailed automatically after check-out),
 *      SI-4.1, CO-3 ; data dictionary: invoice = invoice number + reservation + invoice amount + issue date
 * DECISION D-5: the invoice is produced at check-out (SRS), not at payment time (DFD 3.3 / Fig. 3).
 */
import { PdfDocument } from '../lib/pdf.js';
import { formatDateOnly } from '../lib/dates.js';
import { toNumber } from '../lib/money.js';

const inr = (n) => `INR ${toNumber(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class Invoice {
  static number(reservationNumber, date = new Date()) {
    return `INV-${date.getUTCFullYear()}-${String(reservationNumber).padStart(6, '0')}`;
  }

  /** generatePDF(): itemised invoice document. */
  static generatePDF(invoice, reservation, hotelName) {
    const doc = new PdfDocument();
    doc.rect(0, 770, 595.28, 72, [0.07, 0.1, 0.19]);
    doc.text(hotelName, 50, 808, { size: 20, bold: true, color: [0.93, 0.8, 0.52] });
    doc.text('Hotel Reservation Management System', 50, 790, { size: 9, color: [0.8, 0.83, 0.9] });
    doc.textRight('TAX INVOICE', 545, 808, { size: 16, bold: true, color: [1, 1, 1] });
    doc.textRight(invoice.invoiceNumber, 545, 790, { size: 10, color: [0.8, 0.83, 0.9] });

    let y = 740;
    const g = reservation.guest;
    doc.text('Billed to', 50, y, { size: 8, color: [0.45, 0.5, 0.6] });
    doc.text('Stay', 320, y, { size: 8, color: [0.45, 0.5, 0.6] });
    y -= 15;
    doc.text(g.user.name, 50, y, { size: 11, bold: true });
    doc.text(`Reservation HRMS-${String(reservation.reservationNumber).padStart(6, '0')}`, 320, y, { size: 11, bold: true });
    y -= 14;
    doc.text(g.user.email, 50, y, { size: 9 });
    doc.text(`Room ${reservation.room.roomNumber} - ${reservation.room.roomType.typeName}`, 320, y, { size: 9 });
    y -= 13;
    doc.text(`Guest ID ${g.guestId}`, 50, y, { size: 9 });
    doc.text(`${formatDateOnly(reservation.checkInDate)} to ${formatDateOnly(reservation.checkOutDate)}`, 320, y, { size: 9 });
    y -= 13;
    doc.text(`Issued ${new Date(invoice.issueDate).toISOString().slice(0, 10)}`, 50, y, { size: 9 });
    doc.text(`${reservation.numGuests} guest(s)`, 320, y, { size: 9 });

    doc.y = y - 35;
    const items = invoice.lineItems;
    doc.table(
      [{ header: 'Description', width: 265 }, { header: 'Qty', width: 50, align: 'right' }, { header: 'Unit', width: 90, align: 'right' }, { header: 'Amount', width: 90, align: 'right' }],
      items.map((i) => [i.description, i.quantity, inr(i.unitPrice), inr(i.amount)]),
    );
    let ty = doc.y - 10;
    const totals = [['Subtotal', invoice.subtotal], ['Tax', invoice.taxAmount], ['Total', invoice.totalAmount], ['Paid', invoice.amountPaid]];
    for (const [label, val] of totals) {
      doc.text(label, 360, ty, { size: 10, bold: label === 'Total' });
      doc.textRight(inr(val), 545, ty, { size: 10, bold: label === 'Total' });
      ty -= 16;
    }
    doc.line(360, ty + 8, 545, ty + 8);
    const due = Math.round((toNumber(invoice.totalAmount) - toNumber(invoice.amountPaid)) * 100) / 100;
    doc.text('Balance', 360, ty - 6, { size: 11, bold: true });
    doc.textRight(inr(Math.max(0, due)), 545, ty - 6, { size: 11, bold: true });

    doc.text('All amounts in the hotel base currency (INR, ISO 4217). Payment processed by a PCI-DSS gateway; card data is never stored.', 50, 60, { size: 7, color: [0.45, 0.5, 0.6] });
    doc.text('Thank you for staying with us.', 50, 48, { size: 9, bold: true, color: [0.35, 0.4, 0.5] });
    return doc.toBuffer();
  }
}
