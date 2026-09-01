/**
 * "Create an evil necromancer to challenge my 5th level party."
 *
 * The model designs the *creature*; the module still owns every number. The
 * schema below has no field for AC, HP, an attack bonus, a damage die, a
 * save, a skill modifier or a DC - it cannot express one, so
 * `additionalProperties: false` turns an attempt into a named error rather
 * than a silent bad stat block. What it does choose is a road map and a tier
 * per statistic, exactly the choices a GM makes at the table, and those are
 * read out of the Building Creatures tables afterwards.
 *
 * The creature's level is not the model's either: it comes from the party
 * level and the role the GM picked, through the published encounter-budget
 * arithmetic in encounter.js.
 */
import { requestStructured } from './openai.js';
import { DAMAGE_TYPES, PF2E_SKILLS, SIZES, RARITIES, MODULE_ID, SETTINGS } from '../constants.js';
import { ROAD_MAPS } from '../tables.js';
import { enforceDraft, ALLOWED_TIERS } from '../creature-rules.js';
import { modernizeSpellNames } from '../spellnames.js';

const FOUR_TIERS = ['extreme', 'high', 'moderate', 'low'];
const FIVE_TIERS = [...FOUR_TIERS, 'terrible'];

const tierField = (allowed, description) => ({ type: 'string', enum: allowed, description });

const CONCEPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'description', 'size', 'rarity', 'traits', 'roadMap', 'tiers',
    'abilities', 'speed', 'strikes', 'skills', 'senses', 'languages',
    'spellcasting', 'specials',
  ],
  properties: {
    name: { type: 'string', description: 'The creature\'s name. No level or CR in it.' },
    description: { type: 'string', description: 'A short paragraph: appearance, behaviour, tactics.' },
    size: { type: 'string', enum: Object.keys(SIZES) },
    rarity: { type: 'string', enum: Object.keys(RARITIES) },
    traits: {
      type: 'array',
      items: { type: 'string' },
      description: 'PF2e creature traits in lowercase, e.g. undead, mindless, humanoid. No alignment traits.',
    },
    roadMap: {
      type: 'string',
      enum: Object.keys(ROAD_MAPS),
      description: 'The Building Creatures road map this concept fits best.',
    },
    tiers: {
      type: 'object',
      additionalProperties: false,
      required: ['perception', 'ac', 'fortitude', 'reflex', 'will', 'hp', 'attack', 'damage', 'spell'],
      properties: {
        perception: tierField(FIVE_TIERS),
        ac: tierField(FOUR_TIERS),
        fortitude: tierField(FIVE_TIERS),
        reflex: tierField(FIVE_TIERS),
        will: tierField(FIVE_TIERS),
        hp: tierField(['high', 'moderate', 'low']),
        attack: tierField(FOUR_TIERS),
        damage: tierField(FOUR_TIERS),
        spell: {
          type: ['string', 'null'],
          enum: ['extreme', 'high', 'moderate', null],
          description: 'Null for a creature with no spellcasting.',
        },
      },
      description:
        'Relative strength per statistic, not values. At most two may be extreme, and strengths '
        + 'should be paid for with low or terrible statistics elsewhere.',
    },
    abilities: {
      type: 'object',
      additionalProperties: false,
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      properties: Object.fromEntries(
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, tierField(FOUR_TIERS)]),
      ),
    },
    speed: { type: 'integer', description: 'Land Speed in feet, a multiple of 5, typically 20-40.' },
    strikes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'damageType'],
        properties: {
          name: { type: 'string', description: 'e.g. Claw, Staff, Withering Touch.' },
          kind: { type: 'string', enum: ['melee', 'ranged'] },
          damageType: { type: 'string', enum: DAMAGE_TYPES },
        },
      },
      description: 'One to three Strikes. Numbers come from the tables, so give only name and type.',
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'tier'],
        properties: { slug: { type: 'string', enum: PF2E_SKILLS }, tier: tierField(FOUR_TIERS) },
      },
    },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'range'],
        properties: {
          type: { type: 'string', enum: ['darkvision', 'low-light-vision', 'scent', 'tremorsense', 'truesight', 'echolocation'] },
          range: { type: 'integer', description: 'Feet; 0 for senses without a stated range.' },
        },
      },
    },
    languages: { type: 'array', items: { type: 'string' } },
    spellcasting: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['tradition', 'spells'],
      properties: {
        tradition: { type: 'string', enum: ['arcane', 'divine', 'occult', 'primal'] },
        spells: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'frequency'],
            properties: {
              name: { type: 'string', description: 'A real Pathfinder 2e spell name, remaster naming.' },
              frequency: { type: 'string', enum: ['at-will', 'constant', '1-per-day', '2-per-day', '3-per-day'] },
            },
          },
        },
      },
      description: 'Null unless the creature casts. Ranks and DCs are computed, so do not state them.',
    },
    specials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'actionType', 'description'],
        properties: {
          name: { type: 'string' },
          actionType: { type: 'string', enum: ['passive', 'action', 'reaction', 'free'] },
          description: {
            type: 'string',
            description:
              'PF2e phrasing. Write "DC" with no number where a DC belongs - the module inserts the '
              + 'creature\'s DC. Do not invent damage dice; describe the effect.',
          },
        },
      },
      description: 'Two to four signature abilities that make the creature interesting to fight.',
    },
  },
};

const SYSTEM_PROMPT = [
  'You design Pathfinder Second Edition creatures using the GM Core Building Creatures rules.',
  'You choose a creature\'s concept and its RELATIVE strengths only. You never state a number:',
  'no AC, Hit Points, attack bonus, damage dice, saving throw modifiers, skill modifiers, spell ranks or DCs.',
  'The module reads every value from the published tables for the creature\'s level.',
  'Follow the road maps: pick the one that fits, then adjust tiers for the concept.',
  'At most two statistics may be extreme, and a creature with several high statistics must pay for them',
  'with low or terrible ones - a creature strong at everything is a badly built creature.',
  'Use remaster vocabulary throughout: no alignment traits, no spell schools, vitality and void instead of positive and negative.',
  'Ability descriptions should read like published PF2e abilities: triggers, basic saves, degrees of success.',
].join(' ');

/**
 * Ask for a creature concept at a fixed level. The level is an input, not an
 * output: the caller derived it from the party and the role.
 */
export async function generateConcept({ brief, level, role, partyLevel, partySize, language }, { signal } = {}) {
  const configured = game.settings.get(MODULE_ID, SETTINGS.outputLanguage)?.trim();
  const outputLanguage = language?.trim() || configured || '';

  const user = [
    `Brief: ${brief}`,
    `Design this creature as a level ${level} PF2e creature.`,
    `It is intended as a ${role} against a level ${partyLevel} party of ${partySize}.`,
    outputLanguage ? `Write the name, description and ability text in ${outputLanguage}.` : '',
  ].filter(Boolean).join('\n');

  const concept = await requestStructured({
    schemaName: 'creature_concept',
    schema: CONCEPT_SCHEMA,
    system: SYSTEM_PROMPT,
    user,
    signal,
  });
  return concept;
}

/**
 * Turn a concept into a builder draft, enforcing the hard rules on the way
 * in. Returns the draft plus whatever had to be corrected, so the GM is told
 * rather than silently overruled.
 */
export function conceptToDraft(concept, level) {
  const raw = {
    roadMap: concept.roadMap,
    level,
    name: concept.name,
    description: concept.description,
    size: concept.size,
    rarity: concept.rarity,
    traits: sanitiseTraits(concept.traits),
    speed: clampSpeed(concept.speed),
    perception: concept.tiers.perception,
    ac: concept.tiers.ac,
    fortitude: concept.tiers.fortitude,
    reflex: concept.tiers.reflex,
    will: concept.tiers.will,
    hp: concept.tiers.hp,
    attack: concept.tiers.attack,
    damage: concept.tiers.damage,
    spell: concept.tiers.spell ?? null,
    abilities: { ...concept.abilities },
    strikes: (concept.strikes ?? []).slice(0, 4).map((strike) => ({
      name: String(strike.name).slice(0, 40),
      kind: strike.kind === 'ranged' ? 'ranged' : 'melee',
      damageType: strike.damageType,
    })),
    skills: dedupeSkills(concept.skills),
    senses: (concept.senses ?? []).map((sense) => ({
      type: sense.type,
      acuity: sense.type === 'scent' || sense.type === 'tremorsense' ? 'imprecise' : 'precise',
      range: Math.min(Math.max(Number(sense.range) || 0, 0), 300),
    })),
    languages: (concept.languages ?? []).map((l) => String(l).toLowerCase().trim()).filter(Boolean),
    tradition: concept.spellcasting?.tradition ?? null,
    gear: '',
    drops: { spells: [], specials: [], gear: [], strikes: [] },
    conceptSpells: (concept.spellcasting?.spells ?? []).map((spell) => ({
      // Remastered here too: the model is told to use remaster names, and
      // this makes it true regardless of what it actually wrote.
      name: modernizeSpellNames(String(spell.name).toLowerCase().trim()),
      uses: FREQUENCY_USES[spell.frequency] ?? null,
      atWill: spell.frequency === 'at-will',
      constant: spell.frequency === 'constant',
    })),
    conceptSpecials: (concept.specials ?? []).map((special) => ({
      name: special.name,
      section: 'trait',
      actionType: special.actionType,
      actions: special.actionType === 'action' ? 1 : null,
      category: special.actionType === 'passive' ? 'defensive' : 'offensive',
      description: special.description,
    })),
  };

  // A caster with no spell tier, or a spell tier with no tradition, is a
  // half-built creature either way; reconcile before the rules run.
  if (raw.conceptSpells.length && !raw.spell) raw.spell = 'moderate';
  if (raw.spell && !raw.tradition) raw.tradition = 'arcane';

  const { draft, corrections } = enforceDraft(raw);
  return { draft, corrections };
}

const FREQUENCY_USES = { '1-per-day': 1, '2-per-day': 2, '3-per-day': 3 };

function clampSpeed(value) {
  const speed = Math.round((Number(value) || 25) / 5) * 5;
  return Math.min(Math.max(speed, 0), 120);
}

/** Traits are slugs on the sheet; alignment ones no longer exist. */
function sanitiseTraits(traits = []) {
  const banned = new Set(['good', 'evil', 'lawful', 'chaotic', 'neutral']);
  const out = [];
  for (const trait of traits) {
    const slug = String(trait).toLowerCase().trim().replace(/\s+/g, '-');
    if (!slug || banned.has(slug) || out.includes(slug)) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) continue;
    out.push(slug);
  }
  return out.slice(0, 8);
}

function dedupeSkills(skills = []) {
  const seen = new Map();
  for (const skill of skills) {
    if (!ALLOWED_TIERS.attack.includes(skill.tier)) continue;
    if (!seen.has(skill.slug)) seen.set(skill.slug, { slug: skill.slug, tier: skill.tier });
  }
  return [...seen.values()].slice(0, 8);
}
