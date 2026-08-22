/**
 * SF10-JHS payload types.
 *
 * These mirror `rds.sf10_jhs()` exactly (supabase/migrations/0013).
 * Shaped from the school's real blank form, SFRT Revised 2017.
 */

export interface Sf10Learner {
  last_name: string;
  first_name: string;
  middle_name: string | null;
  name_extension: string | null;
  lrn: string | null;
  birthdate: string | null;
  sex: string | null;
}

export interface Sf10Eligibility {
  type: 'elem_completer' | 'pept' | 'als' | 'other';
  general_average: number | null;
  citation: string | null;
  prev_school_name: string | null;
  prev_school_govt_id: string | null;
  prev_school_address: string | null;
  credential_presented: string | null;
  exam_rating: number | null;
  exam_date: string | null;
}

export interface Sf10Period { ordinal: number; name: string; short_name: string }

export interface Sf10LearningArea {
  subject_id: string;
  title: string;
  is_child: boolean;
  parent_id: string | null;
  ordinal: number;
  period_ratings: Array<{ ordinal: number; rating: number | null }>;
  final_rating: number | null;
  remarks: string | null;
}

export interface Sf10RemedialMark {
  subject: string;
  final_rating: number | null;
  remedial_class_mark: number | null;
  recomputed_final_grade: number | null;
  remarks: string | null;
}

export interface Sf10Block {
  school_year: string;
  grade_level: string;
  section: string | null;
  school_name: string;
  school_govt_id: string | null;
  district: string | null;
  division: string | null;
  region: string | null;
  adviser: string | null;
  periods: Sf10Period[];
  learning_areas: Sf10LearningArea[];
  general_average: number | null;
  promotion_status: string;
  remedial: {
    conducted_from: string | null;
    conducted_to: string | null;
    marks: Sf10RemedialMark[];
  } | null;
}

export interface Sf10Payload {
  form: 'SF10-JHS';
  revision: string;
  learner: Sf10Learner;
  eligibility: Sf10Eligibility | null;
  scholastic_records: Sf10Block[];
  certification: {
    school_name: string;
    school_govt_id: string | null;
    principal_name: string | null;
    generated_on: string;
  };
}

/** Matches the seeded database exactly, so the screen is real-shaped. */
export const SF10_FIXTURE: Sf10Payload = {
  form: 'SF10-JHS',
  revision: 'SFRT Revised 2017',
  learner: {
    last_name: 'Boyore', first_name: 'Joshua', middle_name: 'Reyes',
    name_extension: null, lrn: '136789010005', birthdate: '05/18/2010', sex: 'Male',
  },
  eligibility: {
    type: 'elem_completer', general_average: 89.4, citation: null,
    prev_school_name: 'Angono Elementary School', prev_school_govt_id: '104721',
    prev_school_address: 'Angono, Rizal',
    credential_presented: null, exam_rating: null, exam_date: null,
  },
  scholastic_records: [
    {
      // A year spent at ANOTHER school — four quarters.
      school_year: '2025-2026', grade_level: 'Grade 9', section: 'Sampaguita',
      school_name: 'Taytay National High School', school_govt_id: '301422',
      district: 'Taytay', division: 'Rizal', region: 'IV-A CALABARZON',
      adviser: 'Mr. R. Villanueva',
      periods: [1, 2, 3, 4].map((n) => ({ ordinal: n, name: `Quarter ${n}`, short_name: `Q${n}` })),
      learning_areas: area4(),
      general_average: 86, promotion_status: 'PROMOTED', remedial: null,
    },
    {
      // The current year at this school — THREE terms, under DO 009 s.2026.
      school_year: '2026-2027', grade_level: 'Grade 10', section: 'Pearl',
      school_name: 'Angono National High School', school_govt_id: '301417',
      district: 'Angono', division: 'Rizal', region: 'IV-A CALABARZON',
      adviser: 'Juan Dela Cruz',
      periods: [1, 2, 3].map((n) => ({ ordinal: n, name: `Term ${n}`, short_name: `T${n}` })),
      learning_areas: area3(),
      general_average: 87, promotion_status: 'PROMOTED',
      remedial: {
        conducted_from: '04/12/2027', conducted_to: '05/10/2027',
        marks: [{ subject: 'Science 10', final_rating: 72, remedial_class_mark: 80, recomputed_final_grade: 75, remarks: 'PASSED' }],
      },
    },
  ],
  certification: {
    school_name: 'Angono National High School', school_govt_id: '301417',
    principal_name: 'Dr. Corazon M. Alvarez', generated_on: '08/21/2026',
  },
};

function mk(title: string, ord: number, ratings: number[], isChild = false): Sf10LearningArea {
  const final = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  return {
    subject_id: title, title, is_child: isChild, parent_id: isChild ? 'MAPEH' : null,
    ordinal: ord,
    period_ratings: ratings.map((r, i) => ({ ordinal: i + 1, rating: r })),
    final_rating: final,
    remarks: final >= 75 ? 'PASSED' : 'FAILED',
  };
}

function area4(): Sf10LearningArea[] {
  return [
    mk('Filipino 9', 1, [86, 84, 80, 85]),
    mk('English 9', 2, [76, 80, 80, 82]),
    mk('Mathematics 9', 3, [75, 73, 75, 80]),
    mk('Science 9', 4, [75, 81, 82, 82]),
    mk('Araling Panlipunan (AP) 9', 5, [80, 81, 78, 80]),
    mk('Edukasyon sa Pagpapakatao (EsP) 9', 6, [84, 75, 75, 80]),
    mk('Technology and Livelihood Education (TLE) 9', 7, [80, 80, 80, 82]),
    mk('MAPEH 9', 8, [77, 78, 77, 79]),
    mk('Music 9', 9, [77, 79, 78, 80], true),
    mk('Arts 9', 10, [77, 77, 76, 78], true),
    mk('Physical Education 9', 11, [77, 77, 76, 78], true),
    mk('Health 9', 12, [77, 77, 76, 78], true),
  ];
}

function area3(): Sf10LearningArea[] {
  return [
    mk('Filipino 10', 1, [91, 91, 87]),
    mk('English 10', 2, [82, 83, 82]),
    mk('Mathematics 10', 3, [86, 86, 85]),
    mk('Science 10', 4, [70, 72, 74]),
    mk('Araling Panlipunan (AP) 10', 5, [83, 89, 90]),
    mk('Edukasyon sa Pagpapakatao (EsP) 10', 6, [87, 91, 86]),
    mk('Technology and Livelihood Education (TLE) 10', 7, [88, 91, 92]),
    mk('MAPEH 10', 8, [88, 86, 83]),
    mk('Music 10', 9, [82, 85, 92], true),
    mk('Arts 10', 10, [93, 87, 77], true),
    mk('Physical Education 10', 11, [96, 84, 83], true),
    mk('Health 10', 12, [80, 86, 81], true),
  ];
}
