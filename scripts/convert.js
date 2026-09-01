/**
 * The deterministic 5e-to-PF2e conversion.
 *
 * The principle, stated once: no imported number survives. Each printed stat
 * is compared to what a creature of that CR is expected to have
 * (baseline5e.js), the comparison is kept as a tier - extreme, high,
 * moderate, low, terrible - and the value on the sheet is read from the
 * Building Creatures tables for the mapped level. The same paste always
 * produces the same creature; a GM changes it by changing a tier, not by
 * hoping a model rolls differently.
 */
import { baselineForCR, levelFromCR } from './baseline5e.js';
import { damagePerRound } from './parse5e.js';
import { modernizeSpellNames } from './spellnames.js';
import {
  abilityFor,
  acFor,
  clampLevel,
  hpSpan,
  perceptionFor,
  resistanceFor,
  ROAD_MAPS,
  saveFor,
  skillFor,
  spellAttackFor,
  spellDCFor,
  strikeBonusFor,
  strikeDamageFor,
} from './tables.js';

// --- Vocabulary mappings, 5e name -> pf2e slug ------------------------------

export const DAMAGE_TYPE_MAP = {
  acid: 'acid',
  bludgeoning: 'bludgeoning',
  cold: 'cold',
  fire: 'fire',
  force: 'force',
  lightning: 'electricity',
  necrotic: 'void',
  piercing: 'piercing',
  poison: 'poison',
  psychic: 'mental',
  radiant: 'vitality',
  slashing: 'slashing',
  thunder: 'sonic',
};

export const CREATURE_TYPE_MAP = {
  aberration: 'aberration',
  beast: 'animal',
  celestial: 'celestial',
  construct: 'construct',
  dragon: 'dragon',
  elemental: 'elemental',
  fey: 'fey',
  fiend: 'fiend',
  giant: 'giant',
  humanoid: 'humanoid',
  monstrosity: 'beast',
  ooze: 'ooze',
  plant: 'plant',
  undead: 'undead',
};

/** 5e skill -> pf2e skill. Insight is Perception's job in PF2e, so it is not here. */
export const SKILL_MAP = {
  acrobatics: 'acrobatics',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'society',
  intimidation: 'intimidation',
  investigation: 'society',
  medicine: 'medicine',
  nature: 'nature',
  performance: 'performance',
  persuasion: 'diplomacy',
  religion: 'religion',
  'sleight of hand': 'thievery',
  stealth: 'stealth',
  survival: 'survival',
};

/** 5e condition -> pf2e immunity slug (all verified against CONFIG.PF2E). */
export const CONDITION_MAP = {
  blinded: 'blinded',
  charmed: 'controlled',
  deafened: 'deafened',
  exhaustion: 'fatigued',
  frightened: 'fear-effects',
  grappled: 'grabbed',
  paralyzed: 'paralyzed',
  petrified: 'petrified',
  poisoned: 'poison',
  prone: 'prone',
  restrained: 'immobilized',
  stunned: 'stunned',
  unconscious: 'unconscious',
};

const SENSE_MAP = {
  darkvision: { type: 'darkvision', acuity: 'precise' },
  blindsight: { type: 'echolocation', acuity: 'precise' },
  tremorsense: { type: 'tremorsense', acuity: 'imprecise' },
  truesight: { type: 'truesight', acuity: 'precise' },
};

const SAVE_ABILITY = { str: 'fortitude', con: 'fortitude', dex: 'reflex', int: 'will', wis: 'will', cha: 'will' };

export function mapDamageType(name) {
  return DAMAGE_TYPE_MAP[String(name).toLowerCase().trim()] ?? null;
}

// --- Classification ---------------------------------------------------------

/**
 * Where each printed stat sits against its CR's expectations, as tiers.
 *
 * The thresholds are deliberately coarse. 5e maths is flat: a two-point AC
 * swing is a real statement of intent, so it moves a tier, while one point is
 * noise and does not.
 */
export function classify(data) {
  const cr = data.cr ?? 0;
  const base = baselineForCR(cr);
  const tiers = {};

  const acDiff = (data.ac ?? base.ac) - base.ac;
  tiers.ac = acDiff >= 4 ? 'extreme' : acDiff >= 2 ? 'high' : acDiff >= -1 ? 'moderate' : 'low';

  // Durability relative to the median printed monster of this CR.
  const hpRatio = (data.hp ?? base.hp) / base.hp;
  tiers.hp = hpRatio >= 1.3 ? 'high' : hpRatio >= 0.75 ? 'moderate' : 'low';
  tiers.hpRatio = Math.round(hpRatio * 100) / 100;

  // Saves: rank Con/Dex/Wis against each other, the way PF2e creatures are
  // built (one strong, one middling, one weak). Proficiency in the printed
  // save is what earns the top spot; ties share the better tier.
  const saveBonus = (key) => data.saves?.[key] ?? data.abilities?.[key] ?? 0;
  const ranked = ['con', 'dex', 'wis']
    .map((key) => ({ key, bonus: saveBonus(key) }))
    .sort((a, b) => b.bonus - a.bonus);
  const rankTiers = ['high', 'moderate', 'low'];
  const byAbility = {};
  ranked.forEach((entry, i) => {
    byAbility[entry.key] = entry.bonus === ranked[Math.max(0, i - 1)].bonus && i > 0
      ? byAbility[ranked[i - 1].key]
      : rankTiers[i];
  });
  tiers.fortitude = byAbility.con;
  tiers.reflex = byAbility.dex;
  tiers.will = byAbility.wis;

  // Perception: proficiency in the skill is the signal; raw Wisdom decides
  // between moderate and low for everyone else.
  const perceptionSkill = (data.skills ?? []).find((s) => /^perception$/i.test(s.name));
  const wis = data.abilities?.wis ?? 0;
  tiers.perception = perceptionSkill ? 'high' : wis >= 0 ? 'moderate' : 'low';

  const attackDiff = bestAttackBonus(data) - base.attack;
  tiers.attack = attackDiff >= 5 ? 'extreme' : attackDiff >= 1 ? 'high' : attackDiff >= -2 ? 'moderate' : 'low';

  const dpr = damagePerRound(data);
  const frac = (dpr - base.dmgMin) / Math.max(1, base.dmgMax - base.dmgMin);
  tiers.damage = dpr === 0 ? 'moderate'
    : frac >= 1.1 ? 'extreme' : frac >= 0.6 ? 'high' : frac >= 0.15 ? 'moderate' : 'low';

  // Spellcasting: a full casting feature reads as a caster (high DC); a mere
  // innate list or a printed save DC reads as moderate.
  const specialText = (data.specials ?? []).map((s) => `${s.name} ${s.description}`).join(' ');
  const hasCasting = /spellcasting/i.test(specialText);
  const hasDC = /\bDC\s*\d+/i.test(specialText);
  tiers.spell = hasCasting ? 'high' : hasDC ? 'moderate' : null;

  return tiers;
}

function bestAttackBonus(data) {
  const bonuses = (data.attacks ?? []).map((a) => a.bonus);
  if (bonuses.length === 0) return baselineForCR(data.cr ?? 0).attack;
  return Math.max(...bonuses);
}

// --- Ability text --------------------------------------------------------

/**
 * Rewrite the mechanical anchors inside imported ability prose: every
 * "DC n Wisdom saving throw" becomes "DC m Will save" with the level's DC
 * from the spell DC table. Pure text substitution - flavour is untouched,
 * which is the deterministic promise. The optional AI rewrite can polish the
 * wording afterwards; these substitutions are re-applied on its output too.
 */
export function convertAbilityText(text, { level, spellTier }) {
  const dc = spellDCFor(level, spellTier ?? 'moderate');
  const attack = spellAttackFor(level, spellTier ?? 'moderate');
  let result = String(text ?? '');
  result = result.replace(
    /DC\s*\d+\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/gi,
    (_m, ability) => `DC ${dc} ${capitalise(SAVE_ABILITY[ability.slice(0, 3).toLowerCase()])} save`,
  );
  result = result.replace(/spell save DC\s*\d+/gi, `spell DC ${dc}`);
  result = result.replace(/\bDC\s*\d+\b/g, `DC ${dc}`);
  result = result.replace(
    /[+-]\d+\s+to hit with spell attacks/gi,
    `spell attack +${attack}`,
  );
  result = result.replace(/\bsaving throw\b/gi, 'save');
  return modernizeSpellNames(result);
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Spec building ----------------------------------------------------------

/**
 * Build the creature spec from a parsed block, the classification, and
 * whatever the GM overrode in the preview. The spec is the one shape both
 * tabs produce and the only thing actor.js reads.
 */
export function convertCreature(data, { level: levelOverride, tiers: tierOverrides = {} } = {}) {
  const tiers = { ...classify(data), ...tierOverrides };
  const level = clampLevel(levelOverride ?? levelFromCR(data.cr));

  const abilities = {};
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    // Carried over rather than classified: monster ability modifiers are
    // mostly descriptive in PF2e, and both games use the same scale. Clamped
    // to the published extreme so an imported +10 cannot exceed the level's
    // printed ceiling.
    const raw = data.abilities?.[key] ?? 0;
    abilities[key] = Math.min(raw, abilityFor(level, 'extreme'));
  }

  // HP interpolates across the whole published span by relative durability,
  // then respects an explicit tier override via the tier's midpoint... unless
  // the tier is exactly the classified one, where the smooth value is better.
  const span = hpSpan(level);
  const ratio = Math.min(Math.max((tiers.hpRatio ?? 1) / 1.6, 0), 1);
  const hpValue = tierOverrides.hp
    ? midpointHP(level, tiers.hp)
    : Math.round(span.min + (span.max - span.min) * ratio);

  const traits = [];
  const mappedType = CREATURE_TYPE_MAP[data.type ?? ''] ?? null;
  if (mappedType) traits.push(mappedType);
  if (data.subtype) {
    for (const part of data.subtype.split(/[,/]/).map((s) => s.trim())) {
      if (/^(demon|devil|angel|goblinoid|shapechanger|titan)s?$/.test(part)) traits.push(part.replace(/s$/, ''));
    }
  }

  const textContext = { level, spellTier: tiers.spell };
  const strikes = buildStrikes(data, level, tiers);
  const spec = {
    name: data.name,
    level,
    size: data.size ?? 'med',
    traits,
    rarity: 'common',
    languages: (data.languages ?? []).map((l) => l.toLowerCase()).filter((l) => /^[a-z' -]+$/.test(l)),
    description: '',
    sourceNote: buildProvenance(data, tiers, level),
    perception: { tier: tiers.perception, mod: perceptionFor(level, tiers.perception) },
    senses: (data.senses ?? [])
      .map((s) => (SENSE_MAP[s.type] ? { ...SENSE_MAP[s.type], range: s.range } : null))
      .filter(Boolean),
    abilities,
    ac: { tier: tiers.ac, value: acFor(level, tiers.ac) },
    saves: {
      fortitude: { tier: tiers.fortitude, value: saveFor(level, tiers.fortitude) },
      reflex: { tier: tiers.reflex, value: saveFor(level, tiers.reflex) },
      will: { tier: tiers.will, value: saveFor(level, tiers.will) },
    },
    hp: { tier: tiers.hp, value: hpValue },
    speeds: {
      land: data.speeds?.walk ?? 25,
      others: (data.speeds?.others ?? []).filter((s) => ['burrow', 'climb', 'fly', 'swim'].includes(s.type)),
    },
    strikes,
    skills: buildSkills(data, level),
    spell: tiers.spell
      ? {
          tier: tiers.spell,
          dc: spellDCFor(level, tiers.spell),
          attack: spellAttackFor(level, tiers.spell),
        }
      : null,
    specials: buildSpecials(data, textContext),
    immunities: mapTypedList(data.immunities).concat(
      (data.conditionImmunities ?? [])
        .map((c) => CONDITION_MAP[c.toLowerCase()])
        .filter(Boolean),
    ),
    resistances: mapTypedList(data.resistances).map((type) => ({ type, value: resistanceFor(level) })),
    weaknesses: mapTypedList(data.vulnerabilities).map((type) => ({ type, value: resistanceFor(level) })),
    tiers,
  };
  return spec;
}

function midpointHP(level, tier) {
  const spanOf = { low: 'low', moderate: 'moderate', high: 'high' }[tier] ?? 'moderate';
  const { min, max } = hpSpan(level);
  const positions = { low: 0.15, moderate: 0.5, high: 0.85 };
  return Math.round(min + (max - min) * positions[spanOf]);
}

function mapTypedList(entries = []) {
  const out = [];
  for (const entry of entries) {
    // "bludgeoning, piercing, and slashing from nonmagical attacks" names
    // several types in one clause; harvest them all and note nothing else.
    for (const word of entry.toLowerCase().match(/[a-z]+/g) ?? []) {
      const mapped = DAMAGE_TYPE_MAP[word];
      if (mapped && !out.includes(mapped)) out.push(mapped);
    }
  }
  return out;
}

/**
 * Strikes keep their identity - name, melee or ranged, reach, damage type -
 * and get their numbers from the tables. The hardest-hitting printed attack
 * is the primary and uses the classified damage tier; the rest sit one tier
 * below, which is how the book advises statting secondary attacks.
 */
const LOWER_TIER = { extreme: 'high', high: 'moderate', moderate: 'low', low: 'low' };

function buildStrikes(data, level, tiers) {
  const attacks = [...(data.attacks ?? [])];
  if (attacks.length === 0) return [];
  const primary = attacks.reduce((best, a) => {
    const total = a.damage.reduce((s, d) => s + d.average, 0);
    const bestTotal = best.damage.reduce((s, d) => s + d.average, 0);
    return total > bestTotal ? a : best;
  }, attacks[0]);

  return attacks.map((attack) => {
    const damageTier = attack === primary ? tiers.damage : LOWER_TIER[tiers.damage];
    const { dice } = strikeDamageFor(level, damageTier);
    const first = attack.damage[0];
    const damageType = (first && mapDamageType(first.type)) ?? 'bludgeoning';
    const extra = attack.damage.slice(1)
      .map((d) => ({ dice: d.dice, type: mapDamageType(d.type) }))
      .filter((d) => d.type && /d/.test(d.dice));
    const traits = [];
    if (attack.kind === 'melee' && attack.reach && attack.reach > 5) traits.push(`reach-${Math.min(attack.reach, 30)}`);
    return {
      name: attack.name,
      kind: attack.kind,
      tier: tiers.attack,
      bonus: strikeBonusFor(level, tiers.attack),
      damage: dice,
      damageType,
      extra,
      traits,
      rangeIncrement: attack.kind === 'ranged' ? clampRange(attack.range?.increment) : null,
      rangeMax: attack.kind === 'ranged' ? clampRange(attack.range?.max) : null,
    };
  });
}

/** pf2e's melee-item range field accepts 5-500 in steps of 5. */
function clampRange(value) {
  if (!value) return null;
  return Math.min(Math.max(Math.round(value / 5) * 5, 5), 500);
}

function buildSkills(data, level) {
  const byslug = new Map();
  for (const { name, bonus } of data.skills ?? []) {
    const slug = SKILL_MAP[name.toLowerCase()];
    if (!slug) continue;
    // Expertise (a bonus well past one proficiency) reads as high; plain
    // proficiency as moderate. Two 5e skills can land on one pf2e skill
    // (History and Investigation are both Society); the better one wins.
    const abilityOf = { society: 'int', thievery: 'dex', diplomacy: 'cha' };
    const ability = abilityOf[slug] ?? 'dex';
    const profPart = bonus - (data.abilities?.[ability] ?? 0);
    const tier = profPart >= 2 * (data.prof ?? 2) ? 'high' : 'moderate';
    const existing = byslug.get(slug);
    if (!existing || existing.tier === 'moderate') byslug.set(slug, { slug, tier });
  }
  // A physically imposing creature fights with Athletics even when the
  // printed block never lists it.
  if (!byslug.has('athletics') && (data.abilities?.str ?? 0) >= 3) {
    byslug.set('athletics', { slug: 'athletics', tier: 'moderate' });
  }
  return [...byslug.values()].map(({ slug, tier }) => ({
    slug,
    name: capitalise(slug),
    tier,
    mod: skillFor(level, tier),
  }));
}

const SECTION_TO_ACTION = {
  trait: { actionType: 'passive', actions: null },
  action: { actionType: 'action', actions: 1 },
  'bonus action': { actionType: 'free', actions: null },
  reaction: { actionType: 'reaction', actions: null },
  'legendary action': { actionType: 'free', actions: null },
  'lair action': { actionType: 'free', actions: null },
  'mythic action': { actionType: 'free', actions: null },
  'villain action': { actionType: 'free', actions: null },
};

function buildSpecials(data, textContext) {
  const out = [];
  for (const special of data.specials ?? []) {
    if (/^multiattack$/i.test(special.name)) continue;
    const isAttack = (data.attacks ?? []).some((a) => a.name === special.name);
    if (isAttack) continue;
    const kind = SECTION_TO_ACTION[special.section] ?? SECTION_TO_ACTION.trait;
    out.push({
      name: special.name.replace(/\s*\([^)]*\)\s*$/, ''),
      section: special.section,
      actionType: kind.actionType,
      actions: kind.actions,
      category: special.section === 'trait' ? 'defensive' : 'offensive',
      description: convertAbilityText(special.description, textContext),
    });
  }
  return out;
}

function buildProvenance(data, tiers, level) {
  const parts = [
    `Imported from a 5th-edition stat block (CR ${data.crText || data.cr}) as level ${level}.`,
    `Tiers: AC ${tiers.ac}, HP ${tiers.hp}, Fort ${tiers.fortitude}, Ref ${tiers.reflex}, Will ${tiers.will}, `
      + `Perception ${tiers.perception}, attack ${tiers.attack}, damage ${tiers.damage}`
      + (tiers.spell ? `, spell DC ${tiers.spell}.` : '.'),
    'All values come from the Building Creatures tables; ability prose was carried over with DCs and saves rewritten. Review limited-use abilities and spell lists by hand.',
  ];
  return parts.join(' ');
}

// --- Builder tab -------------------------------------------------------------

/** Seed a builder draft from a road map. */
export function seedFromRoadMap(roadMapKey, level) {
  const map = ROAD_MAPS[roadMapKey] ?? ROAD_MAPS.balanced;
  return {
    roadMap: roadMapKey,
    level: clampLevel(level),
    perception: map.perception,
    ac: map.ac,
    fortitude: map.fortitude,
    reflex: map.reflex,
    will: map.will,
    hp: map.hp,
    attack: map.attack,
    damage: map.damage,
    spell: map.spell,
    abilities: { ...map.abilities },
  };
}

/**
 * A builder draft becomes the same spec shape the importer produces, values
 * read from the same tables.
 */
export function specFromBuilder(draft) {
  const level = clampLevel(draft.level);
  const abilities = {};
  for (const [key, tier] of Object.entries(draft.abilities)) {
    abilities[key] = abilityFor(level, tier);
  }
  return {
    name: draft.name?.trim() || 'New Creature',
    level,
    size: draft.size ?? 'med',
    traits: (draft.traits ?? []).filter(Boolean),
    rarity: draft.rarity ?? 'common',
    languages: [],
    description: draft.description ?? '',
    sourceNote: `Built with the ${draft.roadMap} road map at level ${level}.`,
    perception: { tier: draft.perception, mod: perceptionFor(level, draft.perception) },
    senses: [],
    abilities,
    ac: { tier: draft.ac, value: acFor(level, draft.ac) },
    saves: {
      fortitude: { tier: draft.fortitude, value: saveFor(level, draft.fortitude) },
      reflex: { tier: draft.reflex, value: saveFor(level, draft.reflex) },
      will: { tier: draft.will, value: saveFor(level, draft.will) },
    },
    hp: { tier: draft.hp, value: midpointHP(level, draft.hp) },
    speeds: { land: Number(draft.speed) || 25, others: [] },
    strikes: (draft.strikes ?? []).map((strike) => ({
      name: strike.name?.trim() || 'Strike',
      kind: strike.kind === 'ranged' ? 'ranged' : 'melee',
      tier: draft.attack,
      bonus: strikeBonusFor(level, draft.attack),
      damage: strikeDamageFor(level, draft.damage).dice,
      damageType: strike.damageType,
      extra: [],
      traits: [],
      rangeIncrement: strike.kind === 'ranged' ? 30 : null,
      rangeMax: null,
    })),
    skills: (draft.skills ?? []).map(({ slug, tier }) => ({
      slug,
      name: capitalise(slug),
      tier,
      mod: skillFor(level, tier),
    })),
    spell: draft.spell
      ? { tier: draft.spell, dc: spellDCFor(level, draft.spell), attack: spellAttackFor(level, draft.spell) }
      : null,
    specials: [],
    immunities: [],
    resistances: [],
    weaknesses: [],
    tiers: {},
  };
}
