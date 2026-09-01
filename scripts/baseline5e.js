/**
 * What a stat from the world's oldest roleplaying game (5th edition) is
 * *expected* to look like at a given challenge rating.
 *
 * The importer never copies a 5e number into the sheet. It asks where each
 * printed stat sits relative to these expectations, keeps only the answer
 * ("high AC, low HP"), and reads the actual value for the mapped level from
 * the PF2e Building Creatures tables. The expectations are empirical fits to
 * SRD monsters, not a reproduction of any publisher's table, and they only
 * need to be good enough to rank a stat - a point either way does not move
 * the classification thresholds in convert.js.
 */
import { clampLevel } from './tables.js';

/**
 * Proficiency bonus by CR, per the SRD progression: +2 through CR 4, then
 * +1 every 4 CR.
 */
export function proficiencyForCR(cr) {
  if (cr < 5) return 2;
  return 2 + Math.floor((cr - 1) / 4);
}

/**
 * Expected stats for a published monster of this CR.
 *
 * - `ac`: 13 at low CR, creeping to 19 by the high teens.
 * - `hp`: median printed hit points, a linear fit (goblins ~7, giants ~100+,
 *   ancient dragons ~450+).
 * - `attack`: proficiency plus a typical +4 primary ability.
 * - `damage`: expected damage per round band [min, max]; the width matters
 *   more than the centre, since it turns a DPR into a fraction.
 * - `dc`: typical save DC for CR (8 + proficiency + ability).
 */
export function baselineForCR(cr) {
  const prof = proficiencyForCR(Math.max(cr, 1));
  const ac = cr < 1 ? 13 : Math.min(13 + Math.floor(cr / 3), 19);
  const hp = cr < 0.99
    ? { 0: 3.5, 0.125: 9, 0.25: 13, 0.5: 22 }[cr] ?? 22
    : 10 + 16 * cr;
  const attack = cr < 1 ? 3 : prof + 4;
  const dmgMid = cr < 1
    ? { 0: 1, 0.125: 3, 0.25: 5, 0.5: 7 }[cr] ?? 7
    : 3 + 6 * cr;
  const dc = cr < 1 ? 11 : 8 + prof + 3;
  return {
    prof,
    ac,
    hp,
    attack,
    dc,
    dmgMin: Math.max(1, Math.round(dmgMid * 0.6)),
    dmgMax: Math.round(dmgMid * 1.4),
  };
}

/** "1/4" -> 0.25, "13" -> 13. Returns null for anything unparseable. */
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
 * Default PF2e level for a CR. Mid and high CRs land close to the same number
 * in PF2e's tighter maths; the fractions compress into the lowest levels. This
 * is a starting point the GM adjusts in the preview, not a claim of
 * equivalence.
 */
export function levelFromCR(cr) {
  if (cr === null || cr === undefined || Number.isNaN(cr)) return 1;
  if (cr <= 0) return -1;
  if (cr < 0.4) return 0;
  if (cr < 1) return 1;
  return clampLevel(Math.round(cr));
}
