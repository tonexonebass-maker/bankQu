import type { Debt, Installment } from './supabase';
import {
  formatCurrency,
  formatDate,
  FIXED_INTEREST_RATE,
} from './amortization';

export async function exportDebtToPdf(
  debt: Debt & { installments: Installment[] },
) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('BANK QUW', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Laporan Jadwal Cicilan 10 Bulan', 14, 21);

  // Debtor info
  const infoY = 40;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Data Peminjam', 14, infoY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const paidCount = debt.installments.filter((i) => i.paid).length;
  const totalInterest = debt.installments.reduce(
    (s, i) => s + i.interest_amount,
    0,
  );
  const grandTotal = debt.installments.reduce(
    (s, i) => s + i.total_bill,
    0,
  );

  const infoLines: [string, string][] = [
    ['Nama', debt.name],
    ['Telepon', debt.phone],
    ['Total Pinjaman', formatCurrency(debt.principal)],
    ['Bunga Tetap', `${FIXED_INTEREST_RATE}%`],
    ['Total Bunga', formatCurrency(totalInterest)],
    ['Total Tagihan', formatCurrency(grandTotal)],
    ['Tanggal Mulai', formatDate(debt.start_date)],
    ['Status', `${paidCount} dari 10 cicilan lunas`],
  ];

  infoLines.forEach(([label, value], idx) => {
    const y = infoY + 7 + idx * 6;
    doc.setTextColor(100, 116, 139);
    doc.text(label, 14, y);
    doc.setTextColor(15, 23, 42);
    doc.text(`: ${value}`, 50, y);
  });

  // Installment table
  autoTable(doc, {
    startY: infoY + 7 + infoLines.length * 6 + 6,
    head: [
      ['No', 'Jatuh Tempo', 'Pokok', 'Bunga', 'Total Tagihan', 'Tanggal Bayar', 'Status'],
    ],
    body: debt.installments.map((i) => [
      String(i.number),
      formatDate(i.due_date),
      formatCurrency(i.principal_amount),
      formatCurrency(i.interest_amount),
      formatCurrency(i.total_bill),
      i.paid_date ? formatDate(i.paid_date) : '-',
      i.paid ? 'Lunas' : 'Belum',
    ]),
    theme: 'striped',
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer with generated date
  const finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Laporan dibuat pada ${new Date().toLocaleString('id-ID')}`,
    14,
    finalY + 12,
  );

  const safeName = debt.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`BANK_QUW_${safeName}.pdf`);
}
