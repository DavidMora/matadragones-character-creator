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
import { gearFromParsed } from './equipment.js';
import {
  legendaryTriggerPrefix,
  translateMechanicsText,
  translateNamedSpecial,
  translateRecharge,
} from './mechanics5e.js';
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

/**
 * Language names -> pf2e remaster slugs (verified against the system's
 * LANGUAGES list). Both games' legacy names appear because imported blocks
 * use either. Primordial is the umbrella tongue of all four elemental planes,
 * so it maps to all four. Anything not here - telepathy, "understands but
 * can't speak" clauses, homebrew tongues - is preserved verbatim in the
 * languages details field rather than dropped.
 */
export const LANGUAGE_MAP = {
  common: ['common'],
  abyssal: ['chthonian'],
  aklo: ['aklo'],
  aquan: ['thalassic'],
  auran: ['sussuran'],
  celestial: ['empyrean'],
  daemonic: ['daemonic'],
  'deep speech': ['aklo'],
  draconic: ['draconic'],
  druidic: ['wildsong'],
  dwarvish: ['dwarven'],
  dwarven: ['dwarven'],
  elvish: ['elven'],
  elven: ['elven'],
  giant: ['jotun'],
  gnoll: ['kholo'],
  gnomish: ['gnomish'],
  gnome: ['gnomish'],
  goblin: ['goblin'],
  halfling: ['halfling'],
  ignan: ['pyric'],
  infernal: ['diabolic'],
  jotun: ['jotun'],
  necril: ['necril'],
  orc: ['orcish'],
  orcish: ['orcish'],
  primordial: ['petran', 'pyric', 'sussuran', 'thalassic'],
  protean: ['protean'],
  sylvan: ['fey'],
  terran: ['petran'],
  undercommon: ['sakvroth'],
};

/*
 * The AI path is told to speak remaster, so a compliant model writes
 * `chthonian` or `sakvroth` - names the 5e-keyed map above does not contain,
 * which sent every correct answer into the free-text details field. Each
 * valid pf2e language therefore maps to itself.
 */
export const PF2E_LANGUAGES = [
  'common', 'chthonian', 'aklo', 'thalassic', 'sussuran', 'empyrean', 'daemonic',
  'draconic', 'wildsong', 'dwarven', 'elven', 'fey', 'gnomish', 'goblin', 'halfling',
  'jotun', 'kholo', 'necril', 'orcish', 'petran', 'protean', 'pyric', 'sakvroth',
  'diabolic', 'taldane', 'mwangi', 'osiriani', 'kelish', 'tien', 'ysoki', 'shoanti',
  'varisian', 'vudrani', 'hallit', 'skald', 'utopian', 'requian', 'shadowtongue',
  'amurrun', 'iruxi', 'tengu', 'nagaji', 'vanara', 'sphinx', 'caligni', 'boggard',
  'grippli', 'arboreal', 'alghollthu', 'cyclops', 'muan', 'ocotan', 'adlet', 'calda',
];
for (const slug of PF2E_LANGUAGES) LANGUAGE_MAP[slug] ??= [slug];

/** Split printed languages into valid slugs and a verbatim details string. */
export function mapLanguages(entries = []) {
  const value = [];
  const details = [];
  for (const entry of entries) {
    const mapped = LANGUAGE_MAP[entry.toLowerCase().trim()];
    if (mapped) {
      for (const slug of mapped) if (!value.includes(slug)) value.push(slug);
    } else {
      details.push(entry);
    }
  }
  return { value, details: details.join('; ') };
}

const SENSE_MAP = {
  darkvision: { type: 'darkvision', acuity: 'precise' },
  blindsight: { type: 'echolocation', acuity: 'precise' },
  tremorsense: { type: 'tremorsense', acuity: 'imprecise' },
  truesight: { type: 'truesight', acuity: 'precise' },
};

/** 5e subtype words that name a real pf2e creature trait. */
export const SUBTYPE_TRAITS = {
  demon: 'demon', devil: 'devil', angel: 'angel', titan: 'titan', archon: 'archon',
  daemon: 'daemon', azata: 'azata', shapechanger: 'werecreature', lycanthrope: 'werecreature',
  goblinoid: 'goblin', elf: 'elf', dwarf: 'dwarf', gnome: 'gnome', halfling: 'halfling',
  human: 'human', orc: 'orc', goblin: 'goblin', kobold: 'kobold', gnoll: 'kholo',
  swarm: 'swarm', mindless: 'mindless', incorporeal: 'incorporeal', amphibious: 'amphibious',
  aquatic: 'aquatic',
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

  // Spellcasting: a slot caster reads as a real caster (high DC); an innate
  // list or a mere printed save DC reads as moderate.
  const specialText = (data.specials ?? []).map((s) => `${s.name} ${s.description}`).join(' ');
  const hasDC = /\bDC\s*\d+/i.test(specialText);
  tiers.spell = data.spellcasting
    ? data.spellcasting.groups.some((g) => g.kind === 'slots') ? 'high' : 'moderate'
    : /spellcasting/i.test(specialText) ? 'moderate' : hasDC ? 'moderate' : null;

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
  // A concept ability is written with a bare "DC" precisely so the module
  // fills it in; without this the sheet would say "DC Fortitude save".
  result = result.replace(/\bDC\b(?!\s*\d)/g, `DC ${dc}`);
  result = result.replace(
    /[+-]\d+\s+to hit with spell attacks/gi,
    `spell attack +${attack}`,
  );
  result = result.replace(/\bsaving throw\b/gi, 'save');
  result = translateMechanicsText(result);
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
      // Verified against CONFIG.PF2E.creatureTraits: the remaster has no
      // `shapechanger` (it is `werecreature`) and no `goblinoid` at all, so
      // emitting either produced a raw un-localised chip that no automation
      // or IWR rule could ever match.
      const mapped = SUBTYPE_TRAITS[part.replace(/s$/, '').toLowerCase()];
      if (mapped && !traits.includes(mapped)) traits.push(mapped);
    }
  }

  const textContext = { level, spellTier: tiers.spell };
  const strikes = buildStrikes(data, level, tiers);
  const languages = mapLanguages(data.languages);
  const spellcasting = buildSpellcasting(data, level, tiers);
  const built = buildSpecials(data, textContext);
  const senses = (data.senses ?? [])
    .map((s) => (SENSE_MAP[s.type] ? { ...SENSE_MAP[s.type], range: s.range } : null))
    .filter(Boolean);
  // Senses a translated trait produced (Keen Smell -> scent), deduped by type.
  for (const sense of built.senses) {
    if (!senses.some((s) => s.type === sense.type)) senses.push(sense);
  }
  const spec = {
    name: data.name,
    level,
    size: data.size ?? 'med',
    traits,
    rarity: 'common',
    languages: languages.value,
    languageDetails: languages.details,
    description: '',
    sourceNote: buildProvenance(data, tiers, level),
    perception: { tier: tiers.perception, mod: perceptionFor(level, tiers.perception) },
    senses,
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
    skills: buildSkills(data, level, spellcasting),
    spell: tiers.spell
      ? {
          tier: tiers.spell,
          dc: spellDCFor(level, tiers.spell),
          attack: spellAttackFor(level, tiers.spell),
        }
      : null,
    spellcasting,
    // Descriptive only: the tables above already account for the creature's
    // gear, so nothing here feeds back into AC, attack or damage.
    equipment: gearFromParsed(data).map((name) => ({ name, uuid: null })),
    specials: built.specials,
    // One set: "Damage Immunities poison" and "Condition Immunities poisoned"
    // both map to the poison slug and must not list it twice.
    immunities: [...new Set(mapTypedList(data.immunities).concat(
      (data.conditionImmunities ?? [])
        .map((c) => CONDITION_MAP[c.toLowerCase()])
        .filter(Boolean),
    ))],
    resistances: mapTypedList(data.resistances).map((type) => ({ type, value: resistanceFor(level) })),
    weaknesses: mapTypedList(data.vulnerabilities).map((type) => ({ type, value: resistanceFor(level) })),
    tiers,
  };
  return spec;
}

/**
 * The tradition an innate list belongs to is a judgement call in either game;
 * this one is deterministic and stated: creature type first (a fiend casts
 * divine, a fey casts primal), then the printed casting ability, then arcane.
 * It is a starting point the GM changes on the sheet, not a claim.
 */
const TYPE_TRADITION = {
  animal: 'primal', beast: 'primal', elemental: 'primal', fey: 'primal', plant: 'primal',
  celestial: 'divine', fiend: 'divine', monitor: 'divine',
  aberration: 'occult', undead: 'occult',
};
const ABILITY_TRADITION = { int: 'arcane', wis: 'divine', cha: 'occult' };

/**
 * Turn the parsed spell lists into spellcasting entries the actor builder can
 * realise: an innate entry for at-will/per-day/constant lists, a spontaneous
 * entry with slots for leveled casters, cantrips filed with whichever exists.
 * Names are remastered here; matching them to actual spell documents happens
 * against the compendium at creation time.
 */
function buildSpellcasting(data, level, tiers) {
  const parsed = data.spellcasting;
  if (!parsed || !tiers.spell || parsed.groups.length === 0) return null;

  const dc = spellDCFor(level, tiers.spell);
  const attack = spellAttackFor(level, tiers.spell);
  const tradition = TYPE_TRADITION[CREATURE_TYPE_MAP[data.type ?? ''] ?? '']
    ?? ABILITY_TRADITION[parsed.ability] ?? 'arcane';

  const hasSlots = parsed.groups.some((g) => g.kind === 'slots');
  const forCaster = (g) => g.kind === 'slots' || (g.kind === 'cantrips' && hasSlots);
  // At-will before per-day, so a spell printed under both keeps the better use.
  const ORDER = { 'at-will': 0, constant: 1, cantrips: 2, 'per-day': 3, slots: 4 };
  const sorted = [...parsed.groups].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  const collect = (groups) => {
    const seen = new Set();
    const spells = [];
    for (const group of groups) {
      for (const printed of group.spells) {
        const name = modernizeSpellNames(printed.toLowerCase());
        if (seen.has(name)) continue;
        seen.add(name);
        spells.push({
          name,
          uses: group.kind === 'per-day' ? group.uses : null,
          atWill: group.kind === 'at-will',
          constant: group.kind === 'constant',
          heightenTo: maxSpellRank(level),
        });
      }
    }
    return spells;
  };

  const entries = [];
  const innate = collect(sorted.filter((g) => !forCaster(g)));
  if (innate.length) {
    entries.push({
      name: 'Innate Spellcasting', category: 'innate', tradition,
      ability: parsed.ability, dc, attack, slots: {}, spells: innate,
    });
  }
  const casterSpells = collect(sorted.filter(forCaster));
  if (casterSpells.length) {
    const slots = {};
    for (const group of parsed.groups) {
      if (group.kind === 'slots') slots[Math.min(group.rank5e, 9)] = group.slots;
    }
    entries.push({
      name: 'Spellcasting', category: 'spontaneous', tradition,
      ability: parsed.ability, dc, attack, slots, spells: casterSpells,
    });
  }
  return entries.length ? { entries } : null;
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
/** Strikes made with a body part rather than a weapon. */
const NATURAL_STRIKE = new RegExp(
  '^(bite|claw|claws|slam|tail|tentacle|tentacles|sting|gore|hoof|hooves|talon|talons|'
  + 'fist|pincer|pseudopod|horn|beak|wing|tongue|spine|quill|stomp|maw|jaws|fangs|'
  + 'proboscis|barb|hook|rend|touch|ram)\\b',
  'i',
);

export const LOWER_TIER = { extreme: 'high', high: 'moderate', moderate: 'low', low: 'low' };

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
    /*
     * Rider damage kept its printed dice, which was the one number that
     * survived an import - contradicting the rule the rest of this file
     * exists to enforce. The type is what carries the flavour (a cold bite
     * is a cold bite); the size comes from the level, using the module's
     * rider convention rather than the source's arithmetic.
     */
    const extra = attack.damage.slice(1)
      .map((d) => ({ dice: riderDice(level), type: mapDamageType(d.type) }))
      .filter((d) => d.type);
    const traits = [];
    // Published creatures mark body-part Strikes `unarmed`, which is what
    // unarmed-attack IWR and rules elements key off.
    if (NATURAL_STRIKE.test(attack.name)) traits.push('unarmed');
    if (attack.kind === 'melee' && attack.reach && attack.reach > 5) {
      // Reach traits are a fixed vocabulary in multiples of five; a stray
      // value is spliced out of the array silently by the system.
      const reach = Math.min(Math.round(attack.reach / 5) * 5, 30);
      if (reach > 5) traits.push(`reach-${reach}`);
    }
    // Rider effects written as prose in the source become pf2e attack effects,
    // which is how the sheet advertises Grab and friends beside the strike.
    const attackEffects = [];
    if (/\bgrappled\b/i.test(attack.text)) attackEffects.push('grab');
    if (/knocked prone/i.test(attack.text)) attackEffects.push('knockdown');
    if (/\bpushed\s+\d+\s*(?:feet|ft)/i.test(attack.text)) attackEffects.push('push');
    return {
      name: attack.name,
      kind: attack.kind,
      tier: tiers.attack,
      bonus: strikeBonusFor(level, tiers.attack),
      damage: dice,
      damageType,
      extra,
      traits,
      attackEffects,
      rangeIncrement: attack.kind === 'ranged' ? clampRange(attack.range?.increment) : null,
      rangeMax: attack.kind === 'ranged' ? clampRange(attack.range?.max) : null,
    };
  });
}

/**
 * Extra damage riders, scaled by level.
 *
 * PF2e publishes no rider table, so this is the module's own convention,
 * chosen to sit near what published creatures carry alongside a Strike
 * rather than to reproduce a printed value.
 */
export function riderDice(level) {
  if (level < 4) return '1d6';
  if (level < 9) return '2d6';
  if (level < 15) return '3d6';
  if (level < 19) return '4d6';
  return '5d6';
}

/** pf2e's melee-item range field accepts 5-500 in steps of 5. */
function clampRange(value) {
  if (!value) return null;
  return Math.min(Math.max(Math.round(value / 5) * 5, 5), 500);
}

/**
 * The highest spell rank a creature of this level casts: half its level
 * rounded up, the convention published creatures follow.
 */
export const maxSpellRank = (level) => Math.min(Math.max(Math.ceil(level / 2), 1), 10);

/** The skill each casting tradition trains, per PF2e convention. */
const TRADITION_SKILL = { arcane: 'arcana', divine: 'religion', occult: 'occultism', primal: 'nature' };

function buildSkills(data, level, spellcasting = null) {
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
  // Source blocks under-list skills a PF2e sheet is expected to carry, so a
  // few follow from the concept, deterministically and at moderate only:
  // a physically imposing creature fights with Athletics, an agile one has
  // Acrobatics, a forceful personality Intimidation, and a caster knows the
  // skill of its tradition. Printed skills always win over these defaults.
  const derive = (slug, condition) => {
    if (condition && !byslug.has(slug)) byslug.set(slug, { slug, tier: 'moderate' });
  };
  derive('athletics', (data.abilities?.str ?? 0) >= 3);
  derive('acrobatics', (data.abilities?.dex ?? 0) >= 4);
  derive('intimidation', (data.abilities?.cha ?? 0) >= 4);
  const tradition = spellcasting?.entries?.[0]?.tradition;
  derive(TRADITION_SKILL[tradition], Boolean(tradition));
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
  // Legendary and mythic actions act out of turn; PF2e's out-of-turn tool is
  // the reaction, and buildSpecials states the trigger. Lair actions belong
  // to the place, so they stay free actions.
  'legendary action': { actionType: 'reaction', actions: null },
  'lair action': { actionType: 'free', actions: null },
  'mythic action': { actionType: 'reaction', actions: null },
  'villain action': { actionType: 'reaction', actions: null },
};

const LEGENDARY_SECTIONS = new Set(['legendary action', 'mythic action', 'villain action']);

function buildSpecials(data, textContext) {
  const out = [];
  const senses = [];
  for (const special of data.specials ?? []) {
    if (/^multiattack$/i.test(special.name)) continue;
    // A parsed spell list becomes a real spellcasting entry; keeping the
    // prose trait too would state the spells twice with two different DCs.
    if (data.spellcasting && /spellcasting/i.test(special.name)) continue;
    const isAttack = (data.attacks ?? []).some((a) => a.name === special.name);
    if (isAttack) continue;

    // Source-game-exclusive machinery first: a recognised trait is replaced
    // by its PF2e idiom wholesale, or dropped when PF2e has no use for it.
    const translated = translateNamedSpecial(special, textContext);
    if (translated) {
      if (translated.drop) {
        for (const sense of translated.senses ?? []) senses.push(sense);
        continue;
      }
      out.push({ ...translated, section: special.section });
      continue;
    }

    const kind = SECTION_TO_ACTION[special.section] ?? SECTION_TO_ACTION.trait;
    let name = special.name;
    let description = convertAbilityText(special.description, textContext);
    const recharge = translateRecharge(name);
    if (recharge) {
      name = recharge.name;
      // Conversion runs again every time the GM changes a tier or rewrites
      // the prose, so appending unconditionally stacks the sentence.
      if (!description.includes(recharge.sentence.trim())) description += recharge.sentence;
    }
    if (LEGENDARY_SECTIONS.has(special.section)) {
      description = legendaryTriggerPrefix(description);
    }
    out.push({
      name: name.replace(/\s*\([^)]*\)\s*$/, ''),
      section: special.section,
      actionType: kind.actionType,
      actions: kind.actions,
      category: special.section === 'trait' ? 'defensive' : 'offensive',
      description,
    });
  }
  return { specials: out, senses };
}

function buildProvenance(data, tiers, level) {
  const parts = [
    `Imported from a 5th-edition stat block (CR ${data.crText || data.cr}) as level ${level}.`,
    `Tiers: AC ${tiers.ac}, HP ${tiers.hp}, Fort ${tiers.fortitude}, Ref ${tiers.reflex}, Will ${tiers.will}, `
      + `Perception ${tiers.perception}, attack ${tiers.attack}, damage ${tiers.damage}`
      + (tiers.spell ? `, spell DC ${tiers.spell}.` : '.'),
    'All values come from the Building Creatures tables; ability prose was carried over with DCs, saves and spell names rewritten to remaster. Spell lists become real spellcasting entries matched against the compendium; anything unmatched is listed on the sheet. Review limited-use abilities by hand.',
  ];
  return parts.join(' ');
}

// --- Builder tab -------------------------------------------------------------

/**
 * One innate entry for a built creature: concept spells and dropped spells
 * land together, dropped ones carrying the uuid of the document to clone.
 * Everything mechanical - DC, attack, ranks - still comes from the tables.
 */
function builderSpellcasting(draft, level, contents) {
  const spells = contents.spells.map((spell) => ({
    name: spell.name.toLowerCase(),
    uuid: spell.uuid ?? null,
    uses: spell.uses ?? null,
    atWill: Boolean(spell.atWill),
    constant: Boolean(spell.constant),
    heightenTo: maxSpellRank(level),
  }));
  if (spells.length === 0 || !draft.spell) return null;

  const seen = new Set();
  const unique = spells.filter((spell) => {
    const key = spell.uuid ?? spell.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // A wizard is a prepared caster, not a monster with innate powers; the
  // concept says which, and slots are filled in from the ranks of the spells
  // that actually resolve (see spells.js) rather than guessed here.
  const category = ['innate', 'prepared', 'spontaneous'].includes(draft.castingCategory)
    ? draft.castingCategory
    : 'innate';
  return {
    entries: [{
      name: category === 'innate' ? 'Innate Spellcasting' : 'Spellcasting',
      category,
      tradition: draft.tradition ?? 'arcane',
      ability: 'cha',
      dc: spellDCFor(level, draft.spell),
      attack: spellAttackFor(level, draft.spell),
      slots: {},
      slotsFromSpells: category !== 'innate',
      spells: unique,
    }],
  };
}

/**
 * One entry per item. A dropped item and a typed name for the same thing are
 * still one item, and the entry carrying a uuid wins - it names the exact
 * document the GM chose.
 */
export function dedupeGear(entries) {
  const byName = new Map();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) byName.set(key, entry);
    else if (!existing.uuid && entry.uuid) byName.set(key, entry);
  }
  return [...byName.values()];
}

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
  // One editable set of lists, whoever filled it: the AI concept, a drag and
  // drop, or the GM editing rows by hand. The builder panel renders exactly
  // this, so what is on screen is what gets created.
  const contents = draft.contents ?? { spells: [], specials: [], gear: [] };
  const languages = mapLanguages(draft.languages ?? []);
  return {
    name: draft.name?.trim() || 'New Creature',
    level,
    size: draft.size ?? 'med',
    traits: (draft.traits ?? []).filter(Boolean),
    rarity: draft.rarity ?? 'common',
    languages: languages.value,
    languageDetails: languages.details,
    description: draft.description ?? '',
    sourceNote: `Built with the ${draft.roadMap} road map at level ${level}.`,
    perception: { tier: draft.perception, mod: perceptionFor(level, draft.perception) },
    senses: draft.senses ?? [],
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
      attackEffects: [],
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
    spellcasting: builderSpellcasting(draft, level, contents),
    // A builder strike named for a real weapon puts that weapon in the
    // creature's hands, same rule as the importer: descriptive, never
    // feeding back into the numbers. Dropped gear keeps its uuid so creation
    // clones the exact item the GM dragged in.
    // A strike named for a real weapon puts that weapon in the creature's
    // hands, on top of whatever is listed - deduped, since a concept that
    // proposes a Staff strike and a staff in its gear means one staff.
    equipment: dedupeGear([
      ...gearFromParsed({
        acNote: '',
        gearLine: '',
        attacks: (draft.strikes ?? []).map((s) => ({ name: s.name ?? '' })),
      }).map((name) => ({ name, uuid: null })),
      ...contents.gear.map((item) => ({ name: item.name, uuid: item.uuid ?? null })),
    ]),
    specials: contents.specials.map((special) => (
      // A dropped document is cloned as it is; written text gets the same DC
      // anchoring imported abilities get.
      special.uuid ? { ...special } : {
        ...special,
        description: convertAbilityText(special.description ?? '', { level, spellTier: draft.spell }),
      }
    )),
    immunities: [],
    resistances: [],
    weaknesses: [],
    tiers: {},
  };
}
