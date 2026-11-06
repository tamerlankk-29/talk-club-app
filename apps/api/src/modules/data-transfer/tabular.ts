import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { DomainError } from '../../common/errors/domain-error';
import { CsvColumn, toCsv } from '../../common/utils/csv';

export type Row = Record<string, string>;

/** Reads an uploaded CSV (UTF-8, comma or semicolon) or XLSX file into header-keyed rows. */
export async function readTable(buffer: Buffer, fileName: string): Promise<Row[]> {
  try {
    if (/\.xlsx$/i.test(fileName)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) return [];
      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.text ?? '').trim()));
      const rows: Row[] = [];
      sheet.eachRow((row, index) => {
        if (index === 1) return;
        const obj: Row = {};
        headers.forEach((h, col) => {
          if (h) obj[h] = String(row.getCell(col).text ?? '').trim();
        });
        if (Object.values(obj).some(Boolean)) rows.push(obj);
      });
      return rows;
    }
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
    return parse(text, { columns: (h: string[]) => h.map((x) => x.trim()), skip_empty_lines: true, trim: true, delimiter, relax_column_count: true }) as Row[];
  } catch {
    throw new DomainError('IMPORT_INVALID_FILE');
  }
}

/** Case/spacing-insensitive lookup of the first matching column among aliases. */
export function pick(row: Row, aliases: string[]): string {
  const normalized = new Map(Object.keys(row).map((k) => [k.toLowerCase().replace(/[\s_\-.]/g, ''), k]));
  for (const alias of aliases) {
    const key = normalized.get(alias.toLowerCase().replace(/[\s_\-.]/g, ''));
    if (key && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}

export async function toXlsx<T>(sheetName: string, rows: T[], columns: CsvColumn<T>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Talk Club';
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.header, width: Math.max(12, Math.min(40, c.header.length + 6)) }));
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c.header, c.value(row) ?? ''])));
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export { toCsv };
export type { CsvColumn };
