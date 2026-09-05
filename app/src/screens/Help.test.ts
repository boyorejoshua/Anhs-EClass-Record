import { describe, expect, it } from 'vitest';
import type { Role } from '../data/types';
import { helpPlan, type HelpBlock } from './Help';

/**
 * Help's ordering rule.
 *
 * The screen itself is never rendered here — the test run has no
 * browser. `helpPlan` exists precisely so the rule can be checked
 * without one, the same reason `resolveActiveRole` was lifted out of
 * `App.tsx`.
 *
 * What this guards is the finding it was written for: a registrar used
 * to open Help and land on the teacher's eleven steps, having to scroll
 * past all of them to reach their own four.
 */

const ALL: HelpBlock[] = ['steps', 'adviser', 'registrar', 'learner'];
const ROLES: Role[] = ['teacher', 'adviser', 'registrar', 'school_admin', 'student'];

describe('helpPlan', () => {
  it('puts the teacher on the eleven steps first', () => {
    expect(helpPlan('teacher').yours[0]).toBe('steps');
  });

  it('puts the registrar on their own guide first, not the teacher\'s steps', () => {
    const plan = helpPlan('registrar');
    expect(plan.yours[0]).toBe('registrar');
    // The regression itself: the eleven steps must not lead the page.
    expect(plan.yours).not.toContain('steps');
    expect(plan.others[0]).toBe('steps');
  });

  it('puts the learner on their own guide first', () => {
    const plan = helpPlan('student');
    expect(plan.yours).toEqual(['learner']);
    expect(plan.others[0]).toBe('steps');
  });

  it('gives the adviser their own four moves first, then the steps they also need', () => {
    // An adviser is an "Advisory Teacher" — they teach as well as advise,
    // so the teacher's term is theirs too, just not the thing they open
    // Help to find.
    expect(helpPlan('adviser').yours).toEqual(['adviser', 'steps']);
  });

  it('treats the administrator as holding the registrar\'s guide', () => {
    // `school_admin` in nav.ts is the whole registrar menu plus School
    // Setup, Academic Years and Users.
    const plan = helpPlan('school_admin');
    expect(plan.yours).toEqual(['registrar']);
    expect(plan.yours).not.toContain('steps');
  });

  it('orders, never hides — every block is present exactly once for every role', () => {
    for (const role of ROLES) {
      const { yours, others } = helpPlan(role);
      const all = [...yours, ...others];
      expect([...all].sort()).toEqual([...ALL].sort());
      expect(new Set(all).size).toBe(ALL.length);
    }
  });

  it('gives every role something of their own to read first', () => {
    for (const role of ROLES) {
      expect(helpPlan(role).yours.length).toBeGreaterThan(0);
    }
  });

  it('keeps the original relative order of whatever is demoted', () => {
    // `others` should read steps → adviser → registrar → learner, minus
    // whichever blocks the role owns; demoting one must not reshuffle
    // the rest.
    for (const role of ROLES) {
      const others = helpPlan(role).others;
      const expected = ALL.filter((b) => others.includes(b));
      expect(others).toEqual(expected);
    }
  });
});
