# Grading Calculation — Legacy Validation

*Phase 5 and Phase 27. Does the new engine agree with the legacy one?*

**Answer: yes, on every complete record. One deliberate divergence on
incomplete records, described below.**

Tests: `app/src/lib/recordbook.test.ts` → *legacy calculation parity*.

---

## Method

The legacy model — two item arrays plus a scalar, weighted 30/50/20 — was
reconstructed as a `GradingScheme` so the new engine could be run against
arithmetic worked by hand from `calcQ` (legacy `main.js:100`).

This validates the *shape* of the calculation. It does **not** endorse
the weights: 30/50/20 predates DO 015 s.2026 and the live schemes use
20/50/30 (core) and 20/60/20 (MAPEH / EPP-TLE).

```
Σ raw ÷ Σ HPS × 100  →  PS
PS × weight          →  weighted score
Σ weighted           →  initial grade
transmute(initial)   →  period grade
```

---

## Results

| Scenario | Legacy | New | |
|---|---|---|---|
| Normal spread (all PS = 80) | initial 80.00 → **87** | 80 → **87** | ✅ |
| Perfect scores | 100.00 → **100** | 100 → **100** | ✅ |
| All zeros | 0.00 → **60** | 0 → **60** | ✅ |
| Nothing scored | `null` | `null` | ✅ |
| Decimal score (10.5) | PS 45.00, initial 83.50 → **89** | same | ✅ |
| Exactly on the boundary | initial 60.00 → **75** | 60 → **75** | ✅ |
| Just under the boundary | initial 59.x → **74** | same | ✅ |
| Score above the maximum | flagged, not clamped | flagged, not clamped | ✅ |
| More than ten items | **impossible** | 24 items, PS 80 | ⚠️ legacy limitation |

The **transmutation table** is byte-identical: 41 bands, same boundaries.

### The boundary that matters

`60.00–61.59 → 75`. Seventy-five is the pass mark, so this single row
decides who passes. Both systems agree, and it has its own test.

### Zero is not missing

An initial of 0 transmutes to **60**, not null. A zero is a mark the
learner earned; a blank is a mark not yet given. Both systems keep them
distinct, and the new one keeps a third state — *excused* — that the
legacy system has no representation for.

---

## The one real divergence

**An unscored component.**

| | Legacy | New |
|---|---|---|
| Behaviour | Contributes 0 to the initial grade | Dropped; its weight is redistributed |
| Example: WW 100%, nothing else entered | initial **30.00** → grade 67 | initial **100** → grade 100, flagged provisional |

Legacy `calcQ` sums `(wwWS||0) + (ptWS||0) + (qaWS||0)`, so a component
with no scores lands as zero. In week two of a term, when only Written
Works exists, every learner in the class reads as failing.

The new engine drops a component that has nothing scored and
redistributes its weight, returning `isProvisional: true`. A partial
record therefore reads as a grade-so-far.

**Which is correct?** Both are defensible, and they answer different
questions. The new behaviour is right for the gradebook, which is
consulted daily mid-term. The legacy behaviour is right at
finalization, when an unscored component genuinely is a zero.

The engine supports both: `compute(..., { includeUnscored: true })`
reproduces the legacy result exactly. Running mode is the default for
display; final mode is what submission and finalization must use.

**The two agree exactly once every component has at least one score** —
which is the state any submitted record book is in.

---

## Coverage

`npm test` — 101 tests, all passing.

| Case | Test |
|---|---|
| Normal | ✅ |
| Perfect | ✅ |
| Zero | ✅ |
| Missing / nothing scored | ✅ |
| Partial | ✅ (documented divergence) |
| Above maximum | ✅ (grading suite) |
| Decimal | ✅ |
| Transmuted | ✅ |
| Passing / failing boundary | ✅ both sides |

---

## Conclusion

No bug was found in the new grading engine, and it was not changed. The
brief's instruction — *do not change the grading engine unless the audit
proves its behaviour differs from the intended legacy behaviour* — was
followed: the one behavioural difference is intentional, configurable,
and better for the screen it appears on.
