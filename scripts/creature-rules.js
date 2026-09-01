/**
 * Guardrails for a hand-built or AI-proposed creature.
 *
 * Two kinds of rule, kept apart on purpose:
 *
 * - **Hard rules** are the tables' own vocabulary. AC has no terrible column,
 *   HP has only three, spell DCs stop at moderate, levels run -1 to 24. A
 *   draft that breaks one of these cannot be read out of the tables at all,
 *   so `enforceDraft` corrects it rather than letting it through.
 * - **Budget warnings** are this module's reading of the book's advice that
 *   extreme values are a creature's signature and high statistics should be
 *   paid for with low ones. They are not published numbers, so they warn and
 *   never block - but the band they warn outside of is not invented either:
 *   it is measured from the published road maps themselves (`ROAD_MAPS`), so
 *   anything the book endorses passes by construction.
 */
import { ROAD_MAPS, TIERS } from './tables.js';

/** Which tiers each statistic's table actually offers. */
export const ALLOWED_TIERS = {
  perception: TIERS,
  fortitude: TIERS,
  reflex: TIERS,
  will: TIERS,
  ac: ['extreme', 'high', 'moderate', 'low'],
  attack: ['extreme', 'high', 'moderate', 'low'],
  damage: ['extreme', 'high', 'moderate', 'low'],
  hp: ['high', 'moderate', 'low'],
  spell: ['extreme', 'high', 'moderate'],
};

/** The statistics that count toward a creature's power budget. */
const BUDGETED = ['perception', 'ac', 'fortitude', 'reflex', 'will', 'hp', 'attack', 'damage'];

const TIER_POINTS = { extreme: 2, high: 1, moderate: 0, low: -1, terrible: -2 };

/** A draft's net power in tier points. Zero is a wholly moderate creature. */
export function budgetScore(draft) {
  let score = 0;
  for (const key of BUDGETED) score += TIER_POINTS[draft[key]] ?? 0;
  if (draft.spell) score += TIER_POINTS[draft.spell] ?? 0;
  return score;
}

/**
 * The band the published road maps occupy, computed rather than asserted.
 * Every book-endorsed array lands inside it by definition, which is the
 * point: the warning fires for drafts the book would not have printed.
 */
export function publishedBand() {
  const scores = Object.values(ROAD_MAPS).map((map) => budgetScore(map));
  return { min: Math.min(...scores), max: Math.max(...scores) };
}

/** How many extreme statistics a draft claims. */
export function extremeCount(draft) {
  return [...BUDGETED, 'spell'].filter((key) => draft[key] === 'extreme').length;
}

/**
 * Check a draft. Returns `{ errors, warnings }`, both arrays of
 * `{ key, message }` with localisation-ready message keys and data.
 */
export function validateDraft(draft) {
  const errors = [];
  const warnings = [];

  for (const [key, allowed] of Object.entries(ALLOWED_TIERS)) {
    const value = draft[key];
    if (key === 'spell' && (value === null || value === undefined || value === '')) continue;
    if (!allowed.includes(value)) {
      errors.push({ key, message: 'MCC.Rules.BadTier', data: { stat: key, tier: String(value), allowed: allowed.join(', ') } });
    }
  }

  if (!Number.isInteger(draft.level) || draft.level < -1 || draft.level > 24) {
    errors.push({ key: 'level', message: 'MCC.Rules.BadLevel', data: { level: String(draft.level) } });
  }

  const extremes = extremeCount(draft);
  if (extremes > 2) {
    errors.push({ key: 'extremes', message: 'MCC.Rules.TooManyExtremes', data: { count: extremes } });
  } else if (extremes === 2) {
    warnings.push({ key: 'extremes', message: 'MCC.Rules.TwoExtremes', data: { count: extremes } });
  }

  const score = budgetScore(draft);
  const band = publishedBand();
  if (score > band.max) {
    warnings.push({ key: 'budget', message: 'MCC.Rules.OverBudget', data: { score, max: band.max } });
  } else if (score < band.min) {
    warnings.push({ key: 'budget', message: 'MCC.Rules.UnderBudget', data: { score, min: band.min } });
  }

  // A creature that hits like a boss and shrugs like one too is the classic
  // unwinnable-then-anticlimactic fight; the book pairs strengths with gaps.
  const strong = (key) => ['extreme', 'high'].includes(draft[key]);
  if (strong('ac') && strong('hp') && strong('attack') && strong('damage')) {
    warnings.push({ key: 'nogaps', message: 'MCC.Rules.NoWeakness', data: {} });
  }

  return { errors, warnings };
}

/**
 * Return a draft that passes the hard rules, plus the list of corrections
 * made. Nothing here is a judgement call: an out-of-vocabulary tier snaps to
 * the nearest one the table offers, and surplus extremes step down to high,
 * weakest statistic first, so the creature keeps its signature.
 */
export function enforceDraft(draft) {
  const fixed = { ...draft, abilities: { ...(draft.abilities ?? {}) } };
  const corrections = [];

  for (const [key, allowed] of Object.entries(ALLOWED_TIERS)) {
    const value = fixed[key];
    if (key === 'spell' && (value === null || value === undefined || value === '')) {
      fixed.spell = null;
      continue;
    }
    if (allowed.includes(value)) continue;
    // Snap to the nearest offered tier by strength order, not alphabetically.
    const wanted = TIERS.indexOf(value);
    const nearest = wanted === -1
      ? 'moderate'
      : allowed.reduce((best, tier) => (
        Math.abs(TIERS.indexOf(tier) - wanted) < Math.abs(TIERS.indexOf(best) - wanted) ? tier : best
      ), allowed[0]);
    corrections.push({ key, from: String(value), to: nearest });
    fixed[key] = nearest;
  }

  // Ability tiers use the four-tier ability table.
  for (const [key, value] of Object.entries(fixed.abilities)) {
    if (['extreme', 'high', 'moderate', 'low'].includes(value)) continue;
    corrections.push({ key: `abilities.${key}`, from: String(value), to: 'moderate' });
    fixed.abilities[key] = 'moderate';
  }

  if (!Number.isInteger(fixed.level) || fixed.level < -1 || fixed.level > 24) {
    const clamped = Math.min(Math.max(Math.round(Number(fixed.level) || 1), -1), 24);
    corrections.push({ key: 'level', from: String(draft.level), to: String(clamped) });
    fixed.level = clamped;
  }

  // Surplus extremes: keep the two the creature is most about (offence first,
  // as that is what a player feels), demote the rest.
  const priority = ['damage', 'attack', 'ac', 'hp', 'perception', 'fortitude', 'reflex', 'will', 'spell'];
  const extremes = priority.filter((key) => fixed[key] === 'extreme');
  for (const key of extremes.slice(2)) {
    corrections.push({ key, from: 'extreme', to: 'high' });
    fixed[key] = 'high';
  }

  return { draft: fixed, corrections };
}
