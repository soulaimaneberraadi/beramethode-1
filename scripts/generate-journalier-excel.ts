/**
 * Génère un classeur Excel « journalier par créneaux » comme la grille de suivi
 * (DATE / JOUR / tranches horaires / P. JOURNALIÈRE / TOTAL HEUR), avec formules
 * identiques à la logique d’origine :
 *   - P. JOURN. = SOMME des créneaux de la ligne
 *   - TOTAL HEUR = NB (créneaux numériques) sur la ligne
 *   - Ligne TOTAL : sommes des colonnes P. JOURN. et TOTAL HEUR (+ sommes verticales par créneau)
 *
 * Design : palette sobre (slate / zinc), en-têtes contrastés, pas de cases noires
 * (créneaux inactifs laissés vides — NB ne compte que les nombres).
 *
 * Usage : npx tsx scripts/generate-journalier-excel.ts
 */
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'excel');
const OUT_FILE = path.join(OUT_DIR, 'journalier-creneaux.xlsx');

const SLOT_HEADERS = [
  '4:00/5:00',
  '5:00/6:00',
  '6:00/7:00',
  '7:00/8:00',
  '8:00/9:00',
  '9:00/10:00',
  '10:00/11:00',
  '11:00/12:00',
  '12:00/13:00',
  '13:00/14:00',
] as const;

const FRENCH_DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateFr(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Répartit `total` sur `count` cellules (entiers, somme exacte). */
function spreadTotal(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

// Totaux journaliers alignés sur l’exemple (somme = 8631) ; dimanche = 10 créneaux remplis.
const DAILY_TOTALS = [955, 1100, 1080, 1095, 1105, 1090, 1121, 1085] as const;
// Index 0 = lun 09-03 … index 6 = dim 15-03 (10 créneaux), index 7 = lun 16-03 (8 créneaux)
const SUNDAY_ROW_INDEX = 6;

const thin: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFcbd5e1' },
};

function allBorders(): Partial<ExcelJS.Borders> {
  return {
    top: thin,
    left: thin,
    bottom: thin,
    right: thin,
  };
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BERAMETHODE';
  wb.created = new Date();
  const ws = wb.addWorksheet('Journalier', {
    properties: { defaultRowHeight: 22 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0f172a' },
  };
  const dateColFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFf8fafc' },
  };
  const dayColFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFe0e7ff' },
  };
  const slotFillEven: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFf1f5f9' },
  };
  const slotFillOdd: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFfafafa' },
  };
  const pjFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFecfdf5' },
  };
  const thFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFfff7ed' },
  };
  const totalRowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFe2e8f0' },
  };

  const headerRow = ws.getRow(1);
  const labels = ['DATE', 'JOUR', ...SLOT_HEADERS, 'P. JOURNALIÈRE', 'TOTAL HEUR'];
  labels.forEach((label, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: 'FFf8fafc' }, size: 11, name: 'Calibri' };
    c.fill = headerFill;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = allBorders();
  });
  headerRow.height = 28;

  const startDate = new Date(2026, 2, 9);
  const dataRowCount = DAILY_TOTALS.length;
  const firstDataRow = 2;
  const lastDataRow = firstDataRow + dataRowCount - 1;
  const totalRow = lastDataRow + 1;

  for (let i = 0; i < dataRowCount; i++) {
    const r = firstDataRow + i;
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const row = ws.getRow(r);

    const cDate = row.getCell(1);
    cDate.value = formatDateFr(d);
    cDate.fill = dateColFill;
    cDate.font = { name: 'Calibri', size: 11, color: { argb: 'FF334155' } };
    cDate.alignment = { horizontal: 'center', vertical: 'middle' };
    cDate.border = allBorders();

    const cDay = row.getCell(2);
    cDay.value = FRENCH_DAYS[d.getDay()];
    cDay.fill = dayColFill;
    cDay.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF1e3a8a' } };
    cDay.alignment = { horizontal: 'center', vertical: 'middle' };
    cDay.border = allBorders();

    const slots = i === SUNDAY_ROW_INDEX ? 10 : 8;
    const values = spreadTotal(DAILY_TOTALS[i], slots);
    for (let s = 0; s < 10; s++) {
      const cell = row.getCell(3 + s);
      if (s < slots) {
        cell.value = values[s];
        cell.numFmt = '0';
      } else {
        cell.value = null;
      }
      cell.fill = s % 2 === 0 ? slotFillEven : slotFillOdd;
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0f172a' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = allBorders();
    }

    const cPj = row.getCell(13);
    cPj.value = { formula: `SUM(C${r}:L${r})` };
    cPj.fill = pjFill;
    cPj.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF14532d' } };
    cPj.alignment = { horizontal: 'center', vertical: 'middle' };
    cPj.border = allBorders();

    const cTh = row.getCell(14);
    cTh.value = { formula: `COUNT(C${r}:L${r})` };
    cTh.fill = thFill;
    cTh.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF9a3412' } };
    cTh.alignment = { horizontal: 'center', vertical: 'middle' };
    cTh.border = allBorders();
  }

  const tRow = ws.getRow(totalRow);
  tRow.getCell(1).value = 'TOTAL';
  tRow.getCell(1).font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF0f172a' } };
  tRow.getCell(1).fill = totalRowFill;
  tRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  tRow.getCell(1).border = allBorders();
  tRow.getCell(2).value = '';
  tRow.getCell(2).fill = totalRowFill;
  tRow.getCell(2).border = allBorders();

  for (let s = 0; s < 10; s++) {
    const col = String.fromCharCode('C'.charCodeAt(0) + s);
    const cell = tRow.getCell(3 + s);
    cell.value = { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})` };
    cell.fill = totalRowFill;
    cell.font = { bold: true, name: 'Calibri', size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allBorders();
  }

  tRow.getCell(13).value = { formula: `SUM(M${firstDataRow}:M${lastDataRow})` };
  tRow.getCell(13).fill = totalRowFill;
  tRow.getCell(13).font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF14532d' } };
  tRow.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
  tRow.getCell(13).border = allBorders();

  tRow.getCell(14).value = { formula: `SUM(N${firstDataRow}:N${lastDataRow})` };
  tRow.getCell(14).fill = totalRowFill;
  tRow.getCell(14).font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF9a3412' } };
  tRow.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };
  tRow.getCell(14).border = allBorders();
  tRow.height = 24;

  ws.columns = [
    { width: 12 },
    { width: 12 },
    ...Array(10).fill({ width: 11 }),
    { width: 16 },
    { width: 12 },
  ];

  await mkdir(OUT_DIR, { recursive: true });
  const buf = await wb.xlsx.writeBuffer();
  await writeFile(OUT_FILE, Buffer.from(buf));
  console.log('Écrit :', OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
