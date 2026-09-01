/**
 * The Building Creatures tables from GM Core (originally Gamemastery Guide
 * chapter 2), transcribed for levels -1 through 24.
 *
 * Reproduced rather than computed: the published progressions are not formulas,
 * and a GM checking the book should find the same numbers. Index 0 of every
 * array is level -1; use `idx(level)`.
 *
 * check-tables.mjs asserts internal consistency (column monotonicity, dice
 * averages matching the printed averages, spell attack = DC - 8) so a
 * transcription typo fails loudly instead of quietly skewing one level.
 */

export const MIN_LEVEL = -1;
export const MAX_LEVEL = 24;

export const LEVELS = Array.from(
  { length: MAX_LEVEL - MIN_LEVEL + 1 },
  (_, i) => MIN_LEVEL + i,
);

export function clampLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.round(n), MIN_LEVEL), MAX_LEVEL);
}

const idx = (level) => clampLevel(level) - MIN_LEVEL;

/** Tiers from best to worst. Not every statistic offers every tier. */
export const TIERS = ['extreme', 'high', 'moderate', 'low', 'terrible'];

/**
 * Table: Ability Modifier Scales. Extreme is unlisted below level 1 in the
 * book, so it falls back to high there.
 */
export const ABILITY_MODIFIERS = {
  extreme: [null, null, 5, 5, 5, 6, 6, 7, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 11, 11, 13],
  high: [3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10, 10, 12],
  moderate: [2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 8, 8, 9],
  low: [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7],
};

/**
 * Table: Perception. The book's saving throw scales are the same numbers, so
 * SAVES below aliases this on purpose — one transcription, one place to fix.
 */
export const PERCEPTION = {
  extreme: [9, 10, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 43, 44, 46],
  high: [8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 35, 36, 38, 39, 40, 42],
  moderate: [5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 21, 22, 23, 25, 26, 28, 29, 30, 32, 33, 35, 36, 37, 38],
  low: [2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36],
  terrible: [0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32],
};

export const SAVES = PERCEPTION;

/** Table: Skills. `low` is the top of the printed range, `lowMin` the bottom. */
export const SKILLS = {
  extreme: [8, 9, 10, 11, 13, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33, 35, 36, 38, 40, 41, 43, 45, 46, 48],
  high: [5, 6, 7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 27, 28, 30, 32, 33, 35, 37, 38, 40, 42, 43, 45],
  moderate: [4, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 38, 40],
  low: [2, 3, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 36, 38],
  lowMin: [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 31, 32, 33],
};

/** Table: Armor Class. */
export const AC = {
  extreme: [18, 19, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
  high: [15, 16, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51],
  moderate: [14, 15, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 42, 44, 45, 47, 48, 50],
  low: [12, 13, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48],
};

/** Table: Hit Points. Printed as ranges; each entry is [max, min]. */
export const HP = {
  high: [
    [9, 9], [20, 17], [26, 24], [40, 36], [59, 53], [78, 72], [97, 91],
    [123, 115], [148, 140], [173, 165], [198, 190], [223, 215], [248, 240],
    [273, 265], [298, 290], [323, 315], [348, 340], [373, 365], [398, 390],
    [423, 415], [448, 440], [473, 465], [505, 495], [544, 532], [581, 569],
    [633, 617],
  ],
  moderate: [
    [8, 7], [16, 14], [21, 19], [32, 28], [48, 42], [63, 57], [78, 72],
    [99, 91], [119, 111], [139, 131], [159, 151], [179, 171], [199, 191],
    [219, 211], [239, 231], [259, 251], [279, 271], [299, 291], [319, 311],
    [339, 331], [359, 351], [379, 371], [405, 395], [436, 424], [466, 454],
    [508, 492],
  ],
  low: [
    [6, 5], [13, 11], [16, 14], [25, 21], [37, 31], [48, 42], [59, 53],
    [75, 67], [90, 82], [105, 97], [120, 112], [135, 127], [150, 142],
    [165, 157], [180, 172], [195, 187], [210, 202], [225, 217], [240, 232],
    [255, 247], [270, 262], [285, 277], [305, 295], [329, 317], [351, 339],
    [383, 367],
  ],
};

/** Table: Strike Attack Bonus. */
export const STRIKE_BONUS = {
  extreme: [10, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 27, 28, 29, 31, 32, 34, 35, 37, 38, 40, 41, 43, 44, 46],
  high: [8, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 42, 44],
  moderate: [6, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42],
  low: [4, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 31, 32, 33, 35, 36],
};

/** Table: Strike Damage. Dice expression plus the printed average. */
export const STRIKE_DAMAGE = {
  extreme: [
    { dice: '1d6+3', avg: 6 }, { dice: '1d6+3', avg: 6 }, { dice: '1d8+4', avg: 8 },
    { dice: '1d12+4', avg: 11 }, { dice: '1d12+8', avg: 15 }, { dice: '2d10+7', avg: 18 },
    { dice: '2d12+7', avg: 20 }, { dice: '2d12+10', avg: 23 }, { dice: '2d12+12', avg: 25 },
    { dice: '2d12+15', avg: 28 }, { dice: '2d12+17', avg: 30 }, { dice: '2d12+20', avg: 33 },
    { dice: '2d12+22', avg: 35 }, { dice: '3d12+19', avg: 38 }, { dice: '3d12+21', avg: 40 },
    { dice: '3d12+24', avg: 43 }, { dice: '3d12+26', avg: 45 }, { dice: '3d12+29', avg: 48 },
    { dice: '3d12+31', avg: 50 }, { dice: '3d12+33', avg: 52 }, { dice: '4d12+30', avg: 56 },
    { dice: '4d12+35', avg: 61 }, { dice: '4d12+37', avg: 63 }, { dice: '4d12+39', avg: 65 },
    { dice: '4d12+42', avg: 68 }, { dice: '4d12+44', avg: 70 },
  ],
  high: [
    { dice: '1d4+2', avg: 4 }, { dice: '1d6+2', avg: 5 }, { dice: '1d6+3', avg: 6 },
    { dice: '1d10+4', avg: 9 }, { dice: '1d10+6', avg: 12 }, { dice: '2d8+5', avg: 14 },
    { dice: '2d8+7', avg: 16 }, { dice: '2d8+9', avg: 18 }, { dice: '2d10+9', avg: 20 },
    { dice: '2d10+11', avg: 22 }, { dice: '2d10+13', avg: 24 }, { dice: '2d12+13', avg: 26 },
    { dice: '2d12+15', avg: 28 }, { dice: '3d10+14', avg: 30 }, { dice: '3d10+16', avg: 32 },
    { dice: '3d10+18', avg: 34 }, { dice: '3d12+17', avg: 36 }, { dice: '3d12+18', avg: 37 },
    { dice: '3d12+19', avg: 38 }, { dice: '3d12+20', avg: 40 }, { dice: '4d10+20', avg: 42 },
    { dice: '4d10+22', avg: 44 }, { dice: '4d10+24', avg: 46 }, { dice: '4d10+26', avg: 48 },
    { dice: '4d10+28', avg: 50 }, { dice: '4d10+29', avg: 52 },
  ],
  moderate: [
    { dice: '1d4+1', avg: 3 }, { dice: '1d4+2', avg: 4 }, { dice: '1d6+2', avg: 5 },
    { dice: '1d8+4', avg: 8 }, { dice: '1d8+6', avg: 10 }, { dice: '2d6+5', avg: 12 },
    { dice: '2d6+6', avg: 13 }, { dice: '2d6+8', avg: 15 }, { dice: '2d8+8', avg: 17 },
    { dice: '2d8+9', avg: 18 }, { dice: '2d8+11', avg: 20 }, { dice: '2d10+11', avg: 22 },
    { dice: '2d10+12', avg: 23 }, { dice: '3d8+12', avg: 25 }, { dice: '3d8+14', avg: 27 },
    { dice: '3d8+15', avg: 28 }, { dice: '3d10+14', avg: 30 }, { dice: '3d10+15', avg: 31 },
    { dice: '3d10+16', avg: 32 }, { dice: '3d10+17', avg: 33 }, { dice: '4d8+17', avg: 35 },
    { dice: '4d8+19', avg: 37 }, { dice: '4d8+20', avg: 38 }, { dice: '4d8+22', avg: 40 },
    { dice: '4d8+23', avg: 41 }, { dice: '4d8+24', avg: 43 },
  ],
  low: [
    { dice: '1d4', avg: 2 }, { dice: '1d4+1', avg: 3 }, { dice: '1d4+2', avg: 4 },
    { dice: '1d6+3', avg: 6 }, { dice: '1d6+5', avg: 8 }, { dice: '2d4+4', avg: 9 },
    { dice: '2d4+6', avg: 11 }, { dice: '2d4+7', avg: 12 }, { dice: '2d6+6', avg: 13 },
    { dice: '2d6+8', avg: 15 }, { dice: '2d6+9', avg: 16 }, { dice: '2d6+10', avg: 17 },
    { dice: '2d8+10', avg: 19 }, { dice: '3d6+10', avg: 20 }, { dice: '3d6+11', avg: 21 },
    { dice: '3d6+13', avg: 23 }, { dice: '3d6+14', avg: 24 }, { dice: '3d6+15', avg: 25 },
    { dice: '3d6+16', avg: 26 }, { dice: '3d6+17', avg: 27 }, { dice: '4d6+14', avg: 28 },
    { dice: '4d6+15', avg: 29 }, { dice: '4d6+17', avg: 31 }, { dice: '4d6+18', avg: 32 },
    { dice: '4d6+19', avg: 33 }, { dice: '4d6+21', avg: 35 },
  ],
};

/** Table: Spell DC. Spell attack is printed as DC - 8 throughout. */
export const SPELL_DC = {
  extreme: [19, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36, 37, 39, 40, 41, 43, 44, 46, 47, 48, 50, 51, 52],
  high: [16, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 45, 46, 48],
  moderate: [13, 13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 45],
};

/** Table: Resistances and Weaknesses. [max, min] per level. */
export const RESISTANCES = [
  [1, 1], [3, 1], [3, 2], [5, 2], [6, 3], [7, 4], [8, 4], [9, 5], [10, 5],
  [11, 6], [12, 6], [13, 7], [14, 7], [15, 8], [16, 8], [17, 9], [18, 9],
  [19, 9], [20, 10], [21, 11], [22, 11], [23, 12], [24, 12], [25, 13],
  [26, 13], [27, 14],
];

/**
 * Read one tier from a table, falling back to the nearest tier the table
 * offers: extreme ability modifiers do not exist below level 1, AC has no
 * terrible column, HP has no extreme row, and a caller should get the closest
 * published value rather than undefined.
 */
function tierValue(table, level, tier) {
  const start = TIERS.includes(tier) ? TIERS.indexOf(tier) : TIERS.indexOf('moderate');
  // The requested tier first, then progressively milder ones, then stronger.
  const candidates = [...TIERS.slice(start), ...TIERS.slice(0, start).reverse()];
  for (const candidate of candidates) {
    const column = table[candidate];
    if (!column) continue;
    const value = column[idx(level)];
    if (value !== null && value !== undefined) return value;
  }
  throw new Error(`no value for tier ${tier} at level ${level}`);
}

export const abilityFor = (level, tier) => tierValue(ABILITY_MODIFIERS, level, tier);
export const perceptionFor = (level, tier) => tierValue(PERCEPTION, level, tier);
export const saveFor = (level, tier) => tierValue(SAVES, level, tier);
export const skillFor = (level, tier) => tierValue(SKILLS, level, tier);
export const acFor = (level, tier) => tierValue(AC, level, tier);
export const strikeBonusFor = (level, tier) => tierValue(STRIKE_BONUS, level, tier);
export const strikeDamageFor = (level, tier) => tierValue(STRIKE_DAMAGE, level, tier);
export const spellDCFor = (level, tier) => tierValue(SPELL_DC, level, tier);
export const spellAttackFor = (level, tier) => spellDCFor(level, tier) - 8;

export function hpRangeFor(level, tier) {
  const key = tier in HP ? tier : tier === 'extreme' ? 'high' : tier === 'terrible' ? 'low' : 'moderate';
  return HP[key][idx(level)];
}

/** The midpoint of the published range: the value used when a tier is picked. */
export function hpFor(level, tier) {
  const [max, min] = hpRangeFor(level, tier);
  return Math.round((max + min) / 2);
}

/** Full span of published HP for a level, worst to best, for interpolation. */
export function hpSpan(level) {
  return { min: HP.low[idx(level)][1], max: HP.high[idx(level)][0] };
}

export function resistanceFor(level) {
  const [max, min] = RESISTANCES[idx(level)];
  return Math.round((max + min) / 2);
}

/**
 * Road maps from Building Creatures, as tier presets. They are the book's
 * guidance, not rules: every field is a starting point the GM can move.
 */
export const ROAD_MAPS = {
  balanced: {
    label: 'MCC.RoadMap.Balanced',
    perception: 'moderate', ac: 'moderate',
    fortitude: 'moderate', reflex: 'moderate', will: 'moderate',
    hp: 'moderate', attack: 'moderate', damage: 'moderate', spell: null,
    abilities: { str: 'moderate', dex: 'moderate', con: 'moderate', int: 'low', wis: 'moderate', cha: 'low' },
  },
  brute: {
    label: 'MCC.RoadMap.Brute',
    perception: 'low', ac: 'low',
    fortitude: 'high', reflex: 'low', will: 'low',
    hp: 'high', attack: 'high', damage: 'high', spell: null,
    abilities: { str: 'high', dex: 'low', con: 'high', int: 'low', wis: 'low', cha: 'low' },
  },
  sniper: {
    label: 'MCC.RoadMap.Sniper',
    perception: 'high', ac: 'moderate',
    fortitude: 'low', reflex: 'high', will: 'moderate',
    hp: 'low', attack: 'high', damage: 'moderate', spell: null,
    abilities: { str: 'low', dex: 'high', con: 'low', int: 'moderate', wis: 'moderate', cha: 'low' },
  },
  skirmisher: {
    label: 'MCC.RoadMap.Skirmisher',
    perception: 'moderate', ac: 'moderate',
    fortitude: 'low', reflex: 'high', will: 'moderate',
    hp: 'moderate', attack: 'moderate', damage: 'moderate', spell: null,
    abilities: { str: 'moderate', dex: 'high', con: 'moderate', int: 'low', wis: 'moderate', cha: 'low' },
  },
  soldier: {
    label: 'MCC.RoadMap.Soldier',
    perception: 'moderate', ac: 'high',
    fortitude: 'high', reflex: 'moderate', will: 'moderate',
    hp: 'moderate', attack: 'high', damage: 'high', spell: null,
    abilities: { str: 'high', dex: 'moderate', con: 'moderate', int: 'low', wis: 'moderate', cha: 'low' },
  },
  'magical-striker': {
    label: 'MCC.RoadMap.MagicalStriker',
    perception: 'moderate', ac: 'moderate',
    fortitude: 'moderate', reflex: 'moderate', will: 'moderate',
    hp: 'moderate', attack: 'high', damage: 'high', spell: 'moderate',
    abilities: { str: 'moderate', dex: 'moderate', con: 'moderate', int: 'moderate', wis: 'moderate', cha: 'high' },
  },
  spellcaster: {
    label: 'MCC.RoadMap.Spellcaster',
    perception: 'moderate', ac: 'moderate',
    fortitude: 'low', reflex: 'moderate', will: 'high',
    hp: 'low', attack: 'moderate', damage: 'moderate', spell: 'high',
    abilities: { str: 'low', dex: 'moderate', con: 'low', int: 'high', wis: 'moderate', cha: 'high' },
  },
};
