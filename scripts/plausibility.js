/**
 * Is a transcribed creature plausible for the level it claims?
 *
 * A converted import is safe by construction: whatever the parser or the
 * model produced is only ever a tier, and the value on the sheet comes from
 * the tables. A *transcribed* creature has no such backstop - its numbers go
 * to the sheet as read - so a misparse or a hallucinated figure would arrive
 * silently.
 *
 * This is the backstop. Every statistic is compared against the published
 * span for the creature's level, widened by a tolerance, because the
 * Building Creatures tables describe what creatures of a level actually look
 * like and a genuine outlier is rare while a transposed digit is not. It
 * warns and never blocks: unusual creatures exist, and the GM can see the
 * number and judge.
 */
import {
  acFor,
  hpSpan,
  perceptionFor,
  saveFor,
  spellDCFor,
  strikeBonusFor,
} from './tables.js';

/** How far outside the published span a value may sit before it is flagged. */
const TOLERANCE = 4;

/** Multiplier either side of the HP span, which is much wider than the rest. */
const HP_TOLERANCE = 0.4;

function band(low, high, tolerance = TOLERANCE) {
  return { min: low - tolerance, max: high + tolerance };
}

/**
 * Check a finished spec. Returns `{ stat, value, min, max }` for every value
 * outside its band, in the order a reader would scan the sheet.
 */
export function implausibleStats(spec) {
  const level = spec.level;
  const out = [];
  const test = (stat, value, { min, max }) => {
    if (!Number.isFinite(value) || (value >= min && value <= max)) return;
    out.push({ stat, value, min, max });
  };

  test('AC', spec.ac?.value, band(acFor(level, 'low'), acFor(level, 'extreme')));

  const hp = hpSpan(level);
  test('HP', spec.hp?.value, {
    min: Math.floor(hp.min * (1 - HP_TOLERANCE)),
    max: Math.ceil(hp.max * (1 + HP_TOLERANCE)),
  });

  const saveBand = band(saveFor(level, 'terrible'), saveFor(level, 'extreme'));
  test('Fortitude', spec.saves?.fortitude?.value, saveBand);
  test('Reflex', spec.saves?.reflex?.value, saveBand);
  test('Will', spec.saves?.will?.value, saveBand);
  test('Perception', spec.perception?.mod,
    band(perceptionFor(level, 'terrible'), perceptionFor(level, 'extreme')));

  const strikeBand = band(strikeBonusFor(level, 'low'), strikeBonusFor(level, 'extreme'));
  for (const strike of spec.strikes ?? []) {
    test(`${strike.name} attack`, strike.bonus, strikeBand);
  }

  if (spec.spell) {
    test('spell DC', spec.spell.dc,
      band(spellDCFor(level, 'moderate'), spellDCFor(level, 'extreme')));
  }

  return out;
}

/** A one-line summary per outlier, ready for a notification or a panel. */
export function describeImplausible(entries) {
  return entries.map(({ stat, value, min, max }) => (
    game.i18n.format('MCC.Plausible.Outlier', { stat, value, min, max })
  ));
}
