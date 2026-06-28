import { Injectable } from '@angular/core';

type Cell = string | number;

/** Builds CSV/TXT exports and triggers a client-side download — no server involved. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  toCsv(headers: string[], records: Cell[][]): string {
    const escapeCell = (value: Cell): string => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const lines = [headers.map(escapeCell).join(',')];
    for (const record of records) lines.push(record.map(escapeCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  toTxt(label: string, grouped: boolean, headers: string[], records: Cell[][]): string {
    const lines = [`Item: ${label}`, `Mode: ${grouped ? 'grouped per user' : 'all redemptions'}`, ''];
    const stringRecords = records.map((record) => record.map((cell) => String(cell)));
    const widths = headers.map((header) => header.length);

    for (const record of stringRecords) {
      record.forEach((cell, i) => {
        widths[i] = Math.max(widths[i], cell.length);
      });
    }

    const formatRow = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    lines.push(formatRow(headers));
    lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const record of stringRecords) lines.push(formatRow(record));
    lines.push('', `Total rows: ${records.length}`);
    return lines.join('\n');
  }

  download(filename: string, mime: string, content: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
