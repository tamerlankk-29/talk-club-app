/** RFC 4180 CSV writer with formula-injection protection for spreadsheet apps. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

function escapeCell(raw: string | number | boolean | Date | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let value = raw instanceof Date ? raw.toISOString() : String(raw);
  // Prevent CSV/formula injection when opened in Excel / Google Sheets.
  if (/^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)) value = `'${value}`;
  if (/[",\r\n;]/.test(value)) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  // BOM so Excel opens UTF-8 (Cyrillic names) correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}
