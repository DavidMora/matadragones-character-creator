/**
 * The transcribed Building Creatures tables.
 *
 * External truth is spot-checked where the numbers are best known; everything
 * else is internal consistency, which is what a transcription typo actually
 * breaks: a column that stops rising, a printed average that disagrees with
 * its own dice, a spell attack that is not DC - 8.
 */
import { makeCheck, load } from './harness.mjs';

const t = await load('tables.js');
const { check, done } = makeCheck();

const SPAN = 26; // levels -1..24

// --- Shape -------------------------------------------------------------------
for (const [name, table] of [
  ['abilities', t.ABILITY_MODIFIERS],
  ['perception', t.PERCEPTION],
  ['skills', t.SKILLS],
  ['ac', t.AC],
  ['strike bonus', t.STRIKE_BONUS],
  ['strike damage', t.STRIKE_DAMAGE],
  ['spell dc', t.SPELL_DC],
  ['hp', t.HP],
]) {
  for (const [tier, column] of Object.entries(table)) {
    check(`${name}.${tier} covers 26 levels`, column.length, SPAN);
  }
}
check('resistances cover 26 levels', t.RESISTANCES.length, SPAN);

// --- Monotonicity ------------------------------------------------------------
const nonDecreasing = (values) => values.every((v, i) => i === 0 || v >= values[i - 1]);
for (const [name, table] of [
  ['perception', t.PERCEPTION], ['skills', t.SKILLS], ['ac', t.AC],
  ['strike bonus', t.STRIKE_BONUS], ['spell dc', t.SPELL_DC],
]) {
  for (const [tier, column] of Object.entries(table)) {
    check(`${name}.${tier} never decreases with level`, nonDecreasing(column), true);
  }
}
for (const [tier, column] of Object.entries(t.ABILITY_MODIFIERS)) {
  check(`abilities.${tier} never decreases`, nonDecreasing(column.filter((v) => v !== null)), true);
}
for (const [tier, column] of Object.entries(t.HP)) {
  check(`hp.${tier} max never decreases`, nonDecreasing(column.map(([max]) => max)), true);
  check(`hp.${tier} ranges are ordered`, column.every(([max, min]) => max >= min), true);
}
for (const [tier, column] of Object.entries(t.STRIKE_DAMAGE)) {
  check(`damage.${tier} average never decreases`, nonDecreasing(column.map((d) => d.avg)), true);
}

// --- Cross-column ordering: a better tier is never worse --------------------
for (const level of t.LEVELS) {
  const ordered = (better, worse) => better >= worse;
  check(`level ${level} AC tiers ordered`,
    ordered(t.acFor(level, 'extreme'), t.acFor(level, 'high'))
    && ordered(t.acFor(level, 'high'), t.acFor(level, 'moderate'))
    && ordered(t.acFor(level, 'moderate'), t.acFor(level, 'low')), true);
  check(`level ${level} save tiers ordered`,
    ordered(t.saveFor(level, 'extreme'), t.saveFor(level, 'high'))
    && ordered(t.saveFor(level, 'high'), t.saveFor(level, 'moderate'))
    && ordered(t.saveFor(level, 'moderate'), t.saveFor(level, 'low'))
    && ordered(t.saveFor(level, 'low'), t.saveFor(level, 'terrible')), true);
}

// --- Printed averages agree with their own dice ------------------------------
const diceMean = (expression) => {
  const m = expression.match(/(\d+)d(\d+)(?:\+(\d+))?/);
  return Number(m[1]) * (Number(m[2]) + 1) / 2 + (m[3] ? Number(m[3]) : 0);
};
for (const [tier, column] of Object.entries(t.STRIKE_DAMAGE)) {
  const worst = Math.max(...column.map((d) => Math.abs(diceMean(d.dice) - d.avg)));
  check(`damage.${tier} averages match dice within 1`, worst <= 1, true);
}

// --- Spell attack is DC - 8 --------------------------------------------------
check('spell attack derives from DC', t.spellAttackFor(10, 'high'), t.spellDCFor(10, 'high') - 8);

// --- Spot checks against the published tables --------------------------------
check('level 1 moderate AC', t.acFor(1, 'moderate'), 15);
check('level 1 high AC', t.acFor(1, 'high'), 16);
check('level 10 moderate AC', t.acFor(10, 'moderate'), 29);
check('level 0 moderate perception', t.perceptionFor(0, 'moderate'), 6);
check('level 10 high save', t.saveFor(10, 'high'), 22);
check('level -1 high ability', t.abilityFor(-1, 'high'), 3);
check('level 24 extreme ability', t.abilityFor(24, 'extreme'), 13);
check('level 1 high strike bonus', t.strikeBonusFor(1, 'high'), 9);
check('level 10 moderate strike bonus', t.strikeBonusFor(10, 'moderate'), 21);
check('level 1 high damage dice', t.strikeDamageFor(1, 'high').dice, '1d6+3');
check('level 5 moderate spell DC', t.spellDCFor(5, 'moderate'), 19);
check('level 3 moderate HP midpoint', t.hpFor(3, 'moderate'), 45);

// --- Tier fallback -----------------------------------------------------------
check('extreme ability falls back to high below level 1', t.abilityFor(-1, 'extreme'), 3);
check('terrible AC falls back to low', t.acFor(5, 'terrible'), t.acFor(5, 'low'));
check('extreme HP falls back to high', t.hpFor(5, 'extreme'), t.hpFor(5, 'high'));
check('clampLevel clamps', [t.clampLevel(-4), t.clampLevel(30), t.clampLevel('7')], [-1, 24, 7]);

// --- Road maps stay within the vocabulary ------------------------------------
for (const [key, map] of Object.entries(t.ROAD_MAPS)) {
  const values = [map.perception, map.ac, map.fortitude, map.reflex, map.will,
    map.hp, map.attack, map.damage, ...Object.values(map.abilities)];
  check(`road map ${key} uses known tiers`,
    values.every((v) => t.TIERS.includes(v)), true);
  check(`road map ${key} spell tier valid`,
    map.spell === null || ['extreme', 'high', 'moderate'].includes(map.spell), true);
}

done('building-creatures tables are internally consistent');
