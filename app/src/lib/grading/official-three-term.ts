import type { DescriptorBand, TransmutationBand } from './types';

/* ==================================================================== *
 * THE OFFICIAL DepEd THREE-TERM GRADING DATA
 *
 * Transcribed from HELPER!B8:D48 and HELPER!F8:H48 of the Electronic
 * Class Record published on the DepEd Learning Standards guide site.
 * Both official workbooks — the EPP/TLE/MAPEH one and the core-subject
 * one — carry an IDENTICAL table, which is what says the transmutation
 * does not vary by subject. Only the component weights do.
 *
 * ⚠️ THIS IS A TRANSCRIPTION, AND IT DECIDES WHO PASSES. Forty-one
 * bands is forty-one chances to mistype a number. `official.test.ts`
 * reads the same table back out of the workbook fixture and compares,
 * so a typo here fails the build rather than a learner.
 *
 * It supersedes the table migration 0023 seeded, which came from the
 * school's own workbook while that file still said "(Waiting for the
 * Official DepEd Order)". The two agree that passing begins at an
 * initial grade of 70 and disagree almost everywhere below it — by up
 * to seven points. Migration 0027 replaces it.
 *
 * These values must stay in step with 0027. They are held here as well
 * because the browser needs them to recompute a workbook's own grades
 * in the import preview, and because a constant a test can check is
 * safer than a number that exists only inside a migration.
 * ==================================================================== */

const band = (minInitial: number, maxInitial: number, outputGrade: number): TransmutationBand =>
  ({ minInitial, maxInitial, outputGrade });

/** HELPER!B8:D48 — IG (Min.) · IG (Max.) · Transmuted Grade. */
export const OFFICIAL_TRANSMUTATION: TransmutationBand[] = [
  band(99.5, 100, 100), band(98.32, 99.49, 99), band(97.14, 98.31, 98),
  band(95.96, 97.13, 97), band(94.78, 95.95, 96), band(93.6, 94.77, 95),
  band(92.42, 93.59, 94), band(91.24, 92.41, 93), band(90.06, 91.23, 92),
  band(88.88, 90.05, 91), band(87.7, 88.87, 90), band(86.52, 87.69, 89),
  band(85.34, 86.51, 88), band(84.16, 85.33, 87), band(82.98, 84.15, 86),
  band(81.8, 82.97, 85), band(80.62, 81.79, 84), band(79.44, 80.61, 83),
  band(78.26, 79.43, 82), band(77.08, 78.25, 81), band(75.9, 77.07, 80),
  band(74.72, 75.89, 79), band(73.54, 74.71, 78), band(72.36, 73.53, 77),
  band(71.18, 72.35, 76),
  // ── the pass line ────────────────────────────────────────────────
  band(70, 71.17, 75),
  // Below it the bands widen sharply. The school's anticipated table
  // collapsed everything under 40 onto a flat 60; the official one
  // spreads 60-74 across the whole 0-69.99 range, so a learner on an
  // initial grade of 30 scores 66 here and would have scored 60 there.
  band(65.34, 69.99, 74), band(60.67, 65.33, 73), band(56.01, 60.66, 72),
  band(51.34, 56, 71), band(46.67, 51.33, 70), band(42.01, 46.66, 69),
  band(37.34, 42, 68), band(32.68, 37.33, 67), band(28.01, 32.67, 66),
  band(23.35, 28, 65), band(18.68, 23.34, 64), band(14.01, 18.67, 63),
  band(9.35, 14, 62), band(4.68, 9.34, 61), band(0, 4.67, 60),
];

export interface OfficialDescriptor extends DescriptorBand {
  /** The department's own sentence for this band, from HELPER!H. */
  generalDescription: string;
}

/**
 * HELPER!F8:H48, collapsed to its five bands.
 *
 * The boundaries are on the TRANSMUTED grade, and the table's floor is
 * 60 because that is the lowest grade the transmutation can produce.
 */
export const OFFICIAL_DESCRIPTORS: OfficialDescriptor[] = [
  {
    minGrade: 90, maxGrade: 100, label: 'Advancing', remark: 'Passed',
    generalDescription:
      'Consistently demonstrates skills and understanding that meet or exceed '
      + 'standards with independence, flexibility, and depth.',
  },
  {
    minGrade: 80, maxGrade: 89, label: 'Benchmarking', remark: 'Passed',
    generalDescription:
      'Demonstrates expected grade-level skills and understanding competently '
      + 'and independently.',
  },
  {
    minGrade: 75, maxGrade: 79, label: 'Connecting', remark: 'Passed',
    generalDescription:
      'Demonstrates sufficient understanding and application of grade-level '
      + 'standards with occasional guidance and support',
  },
  {
    minGrade: 65, maxGrade: 74, label: 'Developing', remark: 'Failed',
    generalDescription:
      'Demonstrates partial understanding and inconsistent application of '
      + 'skills, requires targeted support and scaffolding',
  },
  {
    minGrade: 60, maxGrade: 64, label: 'Emerging', remark: 'Failed',
    generalDescription:
      'Does not yet demonstrate foundational skills and understanding; '
      + 'requires intensive support.',
  },
];
