import { describe, expect, it } from 'vitest';
import {
  compareGradeThenSection,
  gradeLevelRank,
  sortByGradeThenSection,
} from './ordering';

/**
 * The case that motivated the whole change is `'Grade 10'` vs
 * `'Grade 7'`. A lexical sort puts 10 first, and that is what nine
 * screens were doing.
 */
describe('gradeLevelRank', () => {
  it('reads the number out of the label', () => {
    expect(gradeLevelRank('Grade 7')).toBe(7);
    expect(gradeLevelRank('Grade 10')).toBe(10);
    expect(gradeLevelRank('Grade 12')).toBe(12);
  });

  it('accepts the shapes a label actually comes in', () => {
    expect(gradeLevelRank('G7')).toBe(7);
    expect(gradeLevelRank('Grade 10 - Diamond')).toBe(10);
    expect(gradeLevelRank('  Grade 8  ')).toBe(8);
  });

  it('ranks a label with no number last, rather than as zero', () => {
    // Zero would put 'Kinder' ahead of Grade 7, which is wrong for a
    // school that has both and merely mislabels one.
    expect(gradeLevelRank('Kinder')).toBeGreaterThan(gradeLevelRank('Grade 12'));
    expect(gradeLevelRank(null)).toBeGreaterThan(gradeLevelRank('Grade 12'));
    expect(gradeLevelRank(undefined)).toBeGreaterThan(gradeLevelRank('Grade 12'));
    expect(gradeLevelRank('')).toBeGreaterThan(gradeLevelRank('Grade 12'));
  });
});

describe('compareGradeThenSection', () => {
  it('orders Grade 7 before Grade 10 — numerically, not alphabetically', () => {
    expect(compareGradeThenSection(
      { gradeLevel: 'Grade 7' }, { gradeLevel: 'Grade 10' },
    )).toBeLessThan(0);
    // And the lexical answer really is the opposite, so the test is
    // testing something.
    expect('Grade 7'.localeCompare('Grade 10')).toBeGreaterThan(0);
  });

  it('falls back to section within one grade level', () => {
    expect(compareGradeThenSection(
      { gradeLevel: 'Grade 10', section: 'Pearl' },
      { gradeLevel: 'Grade 10', section: 'Ruby' },
    )).toBeLessThan(0);
  });

  it('compares numbered sections numerically too', () => {
    expect(compareGradeThenSection(
      { gradeLevel: 'Grade 7', section: 'Section 2' },
      { gradeLevel: 'Grade 7', section: 'Section 10' },
    )).toBeLessThan(0);
  });

  it('puts a missing section after a present one', () => {
    expect(compareGradeThenSection(
      { gradeLevel: 'Grade 7', section: 'Pearl' },
      { gradeLevel: 'Grade 7', section: null },
    )).toBeLessThan(0);
  });

  it('uses the tiebreak so the order is total', () => {
    const a = { gradeLevel: 'Grade 7', section: 'Pearl', tiebreak: 'English' };
    const b = { gradeLevel: 'Grade 7', section: 'Pearl', tiebreak: 'Science' };
    expect(compareGradeThenSection(a, b)).toBeLessThan(0);
    expect(compareGradeThenSection(a, a)).toBe(0);
  });

  it('prefers an explicit ordinal when the caller has one', () => {
    // Label says 7, ordinal says 11 — the ordinal wins, so that
    // threading it through the contracts later needs no caller change.
    expect(compareGradeThenSection(
      { gradeLevel: 'Grade 7', gradeLevelOrdinal: 11 },
      { gradeLevel: 'Grade 10', gradeLevelOrdinal: 9 },
    )).toBeGreaterThan(0);
  });

  it('keeps unnumbered levels in a defined order rather than scattering them', () => {
    expect(compareGradeThenSection(
      { gradeLevel: 'Kinder' }, { gradeLevel: 'Nursery' },
    )).toBeLessThan(0);
  });
});

describe('sortByGradeThenSection', () => {
  const rows = [
    { gradeLevel: 'Grade 10', section: 'Ruby', subject: 'Science' },
    { gradeLevel: 'Grade 7', section: 'Pearl', subject: 'Math' },
    { gradeLevel: 'Grade 12', section: 'Amber', subject: 'English' },
    { gradeLevel: 'Grade 10', section: 'Pearl', subject: 'Math' },
    { gradeLevel: 'Grade 9', section: 'Jade', subject: 'Math' },
  ];
  const key = (r: (typeof rows)[number]) => ({
    gradeLevel: r.gradeLevel, section: r.section, tiebreak: r.subject,
  });

  it('produces school order: 7, 9, 10, 10, 12', () => {
    expect(sortByGradeThenSection(rows, key).map((r) => `${r.gradeLevel}/${r.section}`))
      .toEqual([
        'Grade 7/Pearl',
        'Grade 9/Jade',
        'Grade 10/Pearl',
        'Grade 10/Ruby',
        'Grade 12/Amber',
      ]);
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.subject);
    sortByGradeThenSection(rows, key);
    expect(rows.map((r) => r.subject)).toEqual(before);
  });

  it('is stable across repeated sorts of an already-sorted list', () => {
    const once = sortByGradeThenSection(rows, key);
    const twice = sortByGradeThenSection(once, key);
    expect(twice).toEqual(once);
  });

  it('handles an empty list', () => {
    expect(sortByGradeThenSection([], key)).toEqual([]);
  });
});
