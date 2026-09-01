/**
 * What a Pathfinder First Edition stat block is *expected* to look like at a
 * given CR.
 *
 * Same contract as `baseline5e.js`, and the same honesty about what these
 * numbers are: empirical fits to published PF1e monsters, not a reproduction
 * of any publisher's table. They exist only to rank a printed stat - "this
 * creature's AC is high for its CR" - and the classification thresholds in
 * convert.js are coarse enough that a point either way does not move a tier.
 *
 * PF1e is kinder to the importer than 5e in one respect: it prints Fortitude,
 * Reflex and Will directly, so saves are ranked from the real numbers rather
 * than inferred from ability scores.
 */
import { clampLevel } from './tables.js';

/**
 * Expected statistics for a published PF1e monster of this CR.
 *
 * - `ac`: full AC, not touch or flat-footed.
 * - `hp`: median printed hit points; PF1e hit points grow faster than 5e's,
 *   which is why the fit is quadratic rather than linear.
 * - `attack`: the primary attack bonus of a full-BAB creature.
 * - `damage`: expected damage per round as a band; the width is what turns a
 *   printed damage figure into a fraction.
 * - `goodSave` / `poorSave`: the two save progressions PF1e prints.
 */
export function baselineForCR(cr) {
  const level = Math.max(cr, 0.25);
  return {
    ac: 12 + 1.2 * level,
    hp: 10 + 5 * level + 0.55 * level * level,
    attack: 1.6 + 1.4 * level,
    goodSave: 4 + 0.6 * level,
    poorSave: 1 + 0.4 * level,
    dmgMin: Math.max(1, Math.round((3 + 2.2 * level + 0.1 * level * level) * 0.6)),
    dmgMax: Math.round((3 + 2.2 * level + 0.1 * level * level) * 1.4),
  };
}

/** "1/2" -> 0.5, "7" -> 7. Null for anything unparseable. */
export function parseCR(text) {
  const trimmed = String(text ?? '').trim();
  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  const whole = trimmed.match(/^(\d+)/);
  return whole ? Number(whole[1]) : null;
}

/**
 * Default PF2e level for a PF1e CR.
 *
 * PF1e CR and PF2e level are both "one creature that meaningfully challenges
 * a party of that number", so they line up closely enough to start from
 * equality; the fractions compress into the lowest levels the same way 5e's
 * do. The GM adjusts it in the preview.
 */
export function levelFromCR(cr) {
  if (cr === null || cr === undefined || Number.isNaN(cr)) return 1;
  if (cr <= 0) return -1;
  if (cr < 0.4) return 0;
  if (cr < 1) return 1;
  return clampLevel(Math.round(cr));
}
