import * as XLSX from 'xlsx';
import { numberToWords } from './utils';

export function generateOvertimeExcel(user: any, claim: any) {
  const u = user || {};
  
  // Prepare headers
  const headerData = [
    ['BAHRIA UNIVERSITY OVERTIME CLAIM FORM'],
    [],
    ['NAME:', (u.name || '').toUpperCase(), '', 'DESIGNATION:', (u.designation || '').toUpperCase(), '', 'DEPARTMENT:', (u.department || '').toUpperCase()],
    ['MONTH OF:', `${(claim.month || '').toUpperCase()} ${claim.year || ''}`, '', 'PAY SCALE:', u.payScale || '', '', 'BANK A/C NO:', `${u.bankAccount || ''} ${(u.bankName || '').toUpperCase()}`],
    []
  ];

  // Prepare table headers
  const tableHeaders = [
    ['DATE', 'DAY', 'NATURE OF DUTY', 'RFID TIMING FROM', 'RFID TIMING TO', 'HRS', 'AMOUNT']
  ];

  // Prepare table data
  const tableData = (claim.entries || []).map((entry: any) => [
    entry.date,
    entry.isGazetted ? `${entry.day} (Gazetted)` : entry.day,
    entry.natureOfDuty,
    entry.fromTime,
    entry.toTime,
    entry.hours,
    entry.amount
  ]);

  // Prepare footer
  const footerData = [
    ['TOTAL HOURS & AMOUNT', '', '', '', '', claim.totalHours, claim.totalAmount],
    [],
    [`Overtime @ Rs. ${u.weekdayRate || 120} Per Hour for week days & Rs ${u.weekendRate || 160} for weekend & Rs ${u.holidayRate || 200} for gazetted holiday:`],
    [`Total Claim Amount in Rupees: ${numberToWords(claim.totalAmount)}`],
    [],
    ['', '', '', '', '', "Employee's Sign:_________________"],
    [],
    ['', '', 'Approved / Not Approved', '', '', ''],
    [],
    ["HOD's Signature", '', '', '', '', 'Director / Dy. Registrar (A) Signature']
  ];

  // Combine all data
  const wsData = [...headerData, ...tableHeaders, ...tableData, ...footerData];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // DATE
    { wch: 20 }, // DAY
    { wch: 40 }, // NATURE OF DUTY
    { wch: 20 }, // FROM
    { wch: 20 }, // TO
    { wch: 10 }, // HRS
    { wch: 15 }  // AMOUNT
  ];

  // Create workbook and append worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Overtime Claim');

  // Download Excel file
  XLSX.writeFile(wb, `Overtime_Claim_${u.name || 'User'}_${claim.month || ''}_${claim.year || ''}.xlsx`);
}
