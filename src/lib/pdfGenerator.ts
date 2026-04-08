import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { numberToWords } from './utils';

export interface SummaryRow {
  srNo: number;
  name: string;
  designation: string;
  bankAccount: string;
  weekdaysHours: number;
  weekendHours: number;
  amount: number;
}

export function generateSummaryPDF(month: string, year: number, data: SummaryRow[], returnBlob: boolean = false) {
  const doc = new jsPDF('l', 'mm', 'a4');
  
  const shortYear = year.toString().slice(-2);
  const title = `OVERTIME EXAMINATION CELL FOR THE MONTH OF ${month.toUpperCase()} ${shortYear}`;
  
  const tableData = data.map(row => [
    row.srNo,
    row.name,
    row.designation,
    row.bankAccount,
    row.weekdaysHours,
    row.weekendHours,
    row.amount
  ]);
  
  const totalWeekdays = data.reduce((sum, row) => sum + row.weekdaysHours, 0);
  const totalWeekend = data.reduce((sum, row) => sum + row.weekendHours, 0);
  const totalAmount = data.reduce((sum, row) => sum + row.amount, 0);

  autoTable(doc, {
    startY: 20,
    head: [
      [{ content: title, colSpan: 7, styles: { halign: 'center', fontStyle: 'bold', fontSize: 12 } }],
      ['Sr #', 'NAME', 'DESIGINATION', 'BANK A/C NO', 'WEEK DAYS', 'WEEKEND', 'AMOUNT']
    ],
    body: tableData,
    foot: [
      [{ content: 'GRAND TOTAL', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold' } }, 
       { content: totalWeekdays.toString(), styles: { fontStyle: 'bold' } }, 
       { content: totalWeekend.toString(), styles: { fontStyle: 'bold' } }, 
       { content: totalAmount.toString(), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'grid',
    headStyles: { font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
    bodyStyles: { font: 'helvetica', textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
    footStyles: { font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'left' },
      2: { halign: 'left' },
      3: { halign: 'center' },
      4: { halign: 'center', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 25 },
      6: { halign: 'center', cellWidth: 25 }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Claim Amount in Rupees: ${numberToWords(totalAmount)} Only`, 15, finalY + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Recommended / Not Recommended', 15, finalY + 30);
  
  doc.setLineWidth(0.3);
  doc.line(200, finalY + 30, 280, finalY + 30);
  doc.text('Head Examination', 200, finalY + 35);
  
  doc.text('Approved / Not Approved', 15, finalY + 55);
  
  doc.line(200, finalY + 55, 280, finalY + 55);
  doc.text('Director Admin', 200, finalY + 60);
  
  if (returnBlob) {
    return doc.output('blob');
  } else {
    const safeMonth = (month || '').replace(/[^a-zA-Z0-9 _-]/g, '');
    doc.save(`Overtime_Summary_${safeMonth}_${year}.pdf`);
  }
}

export function generateOvertimePDF(user: any, claim: any, returnBlob: boolean = false) {
  const u = user || {};
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BAHRIA UNIVERSITY OVERTIME CLAIM FORM', 105, 15, { align: 'center' });
  
  // User Info
  doc.setFontSize(10);
  
  let x = 15;
  let y = 25;
  
  // Line 1
  doc.setFont('helvetica', 'bold');
  let text = 'NAME:';
  doc.text(text, x, y);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${(u.name || '').toUpperCase()}`;
  doc.text(text, x, y);
  x += doc.getTextWidth(text) + 5;
  
  doc.setFont('helvetica', 'bold');
  text = 'DESIGNATION:';
  doc.text(text, x, y);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${(u.designation || '').toUpperCase()}`;
  doc.text(text, x, y);
  x += doc.getTextWidth(text) + 5;
  
  doc.setFont('helvetica', 'bold');
  text = 'DEPARTMENT:';
  doc.text(text, x, y);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${(u.department || '').toUpperCase()}`;
  doc.text(text, x, y);
  
  // Line 2
  x = 15;
  y = 35;
  
  doc.setFont('helvetica', 'bold');
  text = 'MONTH OF:';
  doc.text(text, x, y);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${(claim.month || '').toUpperCase()} ${claim.year || ''}`;
  doc.text(text, x, y);
  x += doc.getTextWidth(text) + 5;
  
  doc.setFont('helvetica', 'bold');
  text = 'PAY SCALE:';
  doc.text(text, x, y);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${u.payScale || ''}`;
  doc.text(text, x, y);
  x += doc.getTextWidth(text) + 5;
  
  doc.setFont('helvetica', 'bold');
  text = 'BANK A/C NO:';
  doc.text(text, x, y);
  doc.line(x, y + 1, x + doc.getTextWidth(text), y + 1);
  x += doc.getTextWidth(text) + 2;
  
  doc.setFont('helvetica', 'normal');
  text = `${u.bankAccount || ''} ${(u.bankName || '').toUpperCase()}`;
  doc.text(text, x, y);
  
  // Table
  const tableData = (claim.entries || []).map((entry: any) => [
    entry.date,
    entry.isGazetted ? `${entry.day}\n(Gazetted)` : entry.day,
    entry.natureOfDuty,
    entry.fromTime,
    entry.toTime,
    entry.hours,
    entry.amount
  ]);
  
  autoTable(doc, {
    startY: 45,
    head: [
      [
        { content: 'DATE', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'DAY', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'NATURE OF DUTY', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'RFID TIMING', colSpan: 2, styles: { halign: 'center' } },
        { content: 'HRS', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'AMOUNT', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
      ],
      [
        { content: 'FROM', styles: { halign: 'center' } },
        { content: 'TO', styles: { halign: 'center' } }
      ]
    ],
    body: tableData,
    theme: 'grid',
    headStyles: { font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 65, halign: 'left' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 25, halign: 'center' }
    },
    foot: [[
      { content: 'TOTAL HOURS & AMOUNT', colSpan: 5, styles: { halign: 'center', fontStyle: 'bold' } },
      { content: (claim.totalHours || 0).toString(), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: (claim.totalAmount || 0).toString(), styles: { halign: 'center', fontStyle: 'bold' } }
    ]],
    footStyles: { font: 'helvetica', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 150;
  
  const weekdayRate = u.weekdayRate || 120;
  const weekendRate = u.weekendRate || 160;
  const holidayRate = u.holidayRate || 200;

  // Footer text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Overtime @ Rs. ${weekdayRate} Per Hour for week days & Rs ${weekendRate} for weekend & Rs ${holidayRate} for gazetted holiday:`, 15, finalY + 15);
  doc.text(`Total Claim Amount in Rupees: ${numberToWords(claim.totalAmount || 0)}`, 15, finalY + 25);
  doc.text(`Employee's Sign:_________________`, 140, finalY + 25);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Approved / Not Approved', 105, finalY + 45, { align: 'center' });
  
  doc.text("HOD's Signature", 15, finalY + 70);
  doc.text('Director / Dy. Registrar (A) Signature', 195, finalY + 70, { align: 'right' });
  
  if (returnBlob) {
    return doc.output('blob');
  } else {
    const safeName = (u.name || 'User').replace(/[^a-zA-Z0-9 _-]/g, '');
    const safeMonth = (claim.month || '').replace(/[^a-zA-Z0-9 _-]/g, '');
    doc.save(`Overtime_Claim_${safeName}_${safeMonth}_${claim.year || ''}.pdf`);
  }
}
