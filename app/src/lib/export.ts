/**
 * Export.
 *
 * The Export button had no handler. Rather than inventing formats, this
 * does exactly what the current architecture can honestly support:
 * CSV built from the same data the grid renders, and the browser's own
 * print path.
 *
 * NOT implemented here, deliberately:
 *   • XLSX — V0's excelGrades() (main.js:1176-1322) already encodes the
 *     DepEd workbook shape teachers expect, and docs/10 says that layout
 *     knowledge ports over rather than being re-derived. Re-deriving it
 *     here would create a second, worse implementation.
 *   • PDF   — docs/11 puts official documents through a server-rendered,
 *     numbered, archived pipeline. A clientside PDF would look like an
 *     official document without being one, which is the failure mode
 *     that document engine exists to prevent.
 *
 * CSV is the honest middle: it is what a teacher opens in Excel to keep
 * working, and it makes no claim to be a school form.
 */
import { compute, flattenComponents } from './grading';
import type { GradebookData } from '../data/types';

/** RFC 4180 quoting. A learner named O'Brien, Ma. Concepcion must survive. */
function cell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * The gradebook as a grid: one row per learner, one column per
 * assessment, then the calculated columns.
 */
export function gradebookCsv(data: GradebookData, context: {
  className: string; subject: string; period: string; year: string;
}): string {
  const leaves = flattenComponents(data.scheme.components);
  const ordered = leaves.flatMap((leaf) =>
    data.assessments
      .filter((a) => a.componentId === leaf.id)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((a) => ({ leaf, a })),
  );

  const header = [
    'Learner',
    ...ordered.map(({ leaf, a }) => {
      const siblings = data.assessments.filter((x) => x.componentId === leaf.id).length;
      const label = siblings === 1 ? leaf.code : `${leaf.code}${a.ordinal}`;
      return `${label} (/${a.highestPossibleScore})`;
    }),
    'Initial grade',
    'Grade',
  ];

  const body = data.roster.map((s) => {
    const row = data.scores[s.classEnrollmentId] ?? {};
    const result = compute(
      data.scheme,
      data.assessments,
      data.assessments.map((a) => ({
        assessmentId: a.id,
        raw: row[a.id]?.raw ?? null,
        isExcused: row[a.id]?.isExcused ?? false,
      })),
    );
    return [
      s.displayName,
      ...ordered.map(({ a }) => {
        const c = row[a.id];
        if (c?.isExcused) return 'EX';
        return c?.raw ?? '';
      }),
      result.initialGrade ?? '',
      result.periodGrade ?? '',
    ];
  });

  return toCsv([
    [context.className, context.subject],
    [`SY ${context.year}`, context.period, `Scheme: ${data.scheme.name}`],
    [],
    header,
    ...body,
  ]);
}

/** One row per learner: the calculated result only. */
export function summaryCsv(data: GradebookData, context: {
  className: string; subject: string; period: string; year: string;
}): string {
  const body = data.roster.map((s) => {
    const row = data.scores[s.classEnrollmentId] ?? {};
    const result = compute(
      data.scheme,
      data.assessments,
      data.assessments.map((a) => ({
        assessmentId: a.id,
        raw: row[a.id]?.raw ?? null,
        isExcused: row[a.id]?.isExcused ?? false,
      })),
    );
    const band = data.scheme.descriptors?.find(
      (d) => result.periodGrade != null
        && result.periodGrade >= d.minGrade && result.periodGrade <= d.maxGrade,
    );
    return [
      s.displayName,
      result.initialGrade ?? '',
      result.periodGrade ?? '',
      band?.label ?? '',
      band?.remark ?? '',
    ];
  });

  return toCsv([
    [context.className, context.subject],
    [`SY ${context.year}`, context.period],
    [],
    ['Learner', 'Initial grade', 'Grade', 'Descriptor', 'Remark'],
    ...body,
  ]);
}

/**
 * Hand the file to the browser.
 *
 * A BOM is prepended because Excel on Windows reads a BOM-less UTF-8 CSV
 * as the system codepage, which turns "Peñaflor" into "PeÃ±aflor" on the
 * first open. Filipino names make this immediate, not theoretical.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the
  // download in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filesystem-safe slug for the download name. */
export function slug(...parts: string[]): string {
  return parts
    .join('-')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}
