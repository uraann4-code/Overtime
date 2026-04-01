import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function numberToWords(num: number): string {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const nStr = Math.floor(num).toString();
  if (nStr.length > 9) return 'overflow';
  const n = ('000000000' + nStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
  str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
  str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
  str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
  str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
  
  // Capitalize first letter and add "Only"
  const result = str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' Only';
  return result;
}

export function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function calculateHours(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  
  let diff = (toH * 60 + toM) - (fromH * 60 + fromM);
  if (diff < 0) diff += 24 * 60; // Handle overnight if needed, though unlikely for OT
  
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  
  let roundedMinutes = 0;
  if (minutes <= 15) {
    roundedMinutes = 0;
  } else if (minutes <= 45) {
    roundedMinutes = 30;
  } else {
    roundedMinutes = 60;
  }
  
  return hours + (roundedMinutes / 60);
}

export function calculateAmount(hours: number, day: string, isGazetted: boolean, rates: { weekday: number, weekend: number, holiday: number }): number {
  if (isGazetted) return hours * rates.holiday;
  if (day === 'Saturday' || day === 'Sunday') return hours * rates.weekend;
  return hours * rates.weekday;
}
