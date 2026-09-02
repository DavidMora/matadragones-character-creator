/**
 * The optional LLM assists. Everything here is a convenience on top of the
 * deterministic pipeline, never a replacement for it:
 *
 * - `aiParseStatBlock` transcribes a paste the regex parser could not handle
 *   into the same structured shape parse5e.js produces. The system prompt and
 *   the strict schema both confine it to transcription; the conversion maths
 *   that follows is identical to the deterministic path, so the model still
 *   cannot put a number on the sheet.
 * - `aiRewriteAbilities` polishes carried-over ability prose into PF2e idiom.
 *   The deterministic DC/save substitutions are re-applied to whatever comes
 *   back, so even here the mechanical anchors are computed, not generated.
 */
import { requestStructured } from './openai.js';
import { convertAbilityText } from '../convert.js';
import { parseCR, proficiencyForCR } from '../baseline5e.js';
import { reparseSpecials, diceAverage } from '../parse5e.js';
import { clampLevel } from '../tables.js';
import { mapLanguages } from '../convert.js';

const ABILITY_PROPS = Object.fromEntries(
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, { type: 'integer' }]),
);

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'size', 'type', 'ac', 'hp', 'walkSpeed', 'otherSpeeds', 'abilities',
    'saves', 'skills', 'resistances', 'immunities', 'vulnerabilities',
    'conditionImmunities', 'senses', 'languages', 'cr', 'specials',
  ],
  properties: {
    name: { type: 'string' },
    size: { type: 'string', enum: ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'] },
    type: { type: 'string' },
    ac: { type: 'integer' },
    hp: { type: 'integer' },
    walkSpeed: { type: 'integer' },
    otherSpeeds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: {
          type: { type: 'string', enum: ['burrow', 'climb', 'fly', 'swim'] },
          value: { type: 'integer' },
        },
      },
    },
    abilities: {
      type: 'object',
      additionalProperties: false,
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      properties: ABILITY_PROPS,
      description: 'Ability MODIFIERS, not scores.',
    },
    saves: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ability', 'bonus'],
        properties: {
          ability: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
          bonus: { type: 'integer' },
        },
      },
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'bonus'],
        properties: { name: { type: 'string' }, bonus: { type: 'integer' } },
      },
    },
    resistances: { type: 'array', items: { type: 'string' } },
    immunities: { type: 'array', items: { type: 'string' } },
    vulnerabilities: { type: 'array', items: { type: 'string' } },
    conditionImmunities: { type: 'array', items: { type: 'string' } },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'range'],
        properties: {
          type: { type: 'string', enum: ['darkvision', 'blindsight', 'tremorsense', 'truesight'] },
          range: { type: 'integer' },
        },
      },
    },
    languages: { type: 'array', items: { type: 'string' } },
    cr: { type: 'string', description: 'Challenge rating exactly as printed, e.g. "1/4" or "13".' },
    specials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'section', 'description'],
        properties: {
          name: { type: 'string' },
          section: {
            type: 'string',
            enum: ['trait', 'action', 'bonus action', 'reaction', 'legendary action', 'lair action'],
          },
          description: { type: 'string' },
        },
      },
    },
  },
};

const PARSE_SYSTEM = [
  'You transcribe monster stat blocks into structured data.',
  'Copy every number exactly as printed. Never estimate, repair, or invent a value;',
  'if a field is absent from the text, use 0 for numbers and [] for lists.',
  'Ability values are the modifiers in parentheses, not the scores.',
  'Include every trait, action, bonus action, reaction and legendary action verbatim in specials,',
  'including attack actions with their full text.',
].join(' ');

/**
 * Transcribe a stat block via the model and return it in the shape
 * parse5eStatBlock's `data` uses, so the rest of the pipeline cannot tell the
 * difference.
 */
export async function aiParseStatBlock(text, { signal } = {}) {
  const raw = await requestStructured({
    schemaName: 'stat_block_transcription',
    schema: PARSE_SCHEMA,
    system: PARSE_SYSTEM,
    user: text,
    signal,
  });
  return finishAiParse(transcriptionToParseData(raw));
}

/** Pure mapping, exported so tests cover it without an API in the room. */
export function transcriptionToParseData(raw) {
  const cr = parseCR(raw.cr);
  const data = {
    name: raw.name,
    size: raw.size,
    type: raw.type.toLowerCase(),
    subtype: null,
    tags: '',
    ac: raw.ac,
    acNote: '',
    hp: raw.hp,
    hpFormula: '',
    speeds: { walk: raw.walkSpeed || 25, others: raw.otherSpeeds },
    abilities: { ...raw.abilities },
    scores: {},
    saves: Object.fromEntries(raw.saves.map((s) => [s.ability, s.bonus])),
    skills: raw.skills,
    resistances: raw.resistances,
    immunities: raw.immunities,
    vulnerabilities: raw.vulnerabilities,
    conditionImmunities: raw.conditionImmunities,
    senses: raw.senses,
    passivePerception: null,
    languages: raw.languages,
    cr,
    crText: raw.cr,
    prof: cr === null ? 2 : proficiencyForCR(cr),
    specials: raw.specials,
    attacks: [],
    multiattack: null,
  };
  return data;
}

/** Run the deterministic attack extraction over AI-transcribed specials. */
export function finishAiParse(data) {
  reparseSpecials(data);
  return data;
}

const REWRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['abilities'],
  properties: {
    abilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
};

const REWRITE_SYSTEM = [
  'You edit creature ability descriptions into Pathfinder Second Edition phrasing:',
  'basic saves, degrees of success, PF2e condition names, concise remaster style.',
  'Use remaster spell names, never legacy or other-game ones (force barrage, not magic missile;',
  'mystic armor, not mage armor; translocate, not dimension door); if a spell has no PF2e',
  'equivalent you are sure of, keep its name unchanged rather than guessing.',
  'Keep every DC, damage roll, distance and duration exactly as given - you may move them, never change them.',
  'Return one entry per input ability, same names, same order. Do not add or drop abilities.',
].join(' ');

/**
 * Rewrite ability prose into PF2e idiom. Numbers are re-anchored afterwards:
 * the deterministic DC substitution runs over the model's text, so a drifted
 * DC is corrected rather than trusted.
 */
export async function aiRewriteAbilities(spec, { signal } = {}) {
  if (!spec.specials?.length) return spec;
  const payload = {
    creature: `${spec.name}, a level ${spec.level} creature`,
    abilities: spec.specials.map(({ name, description }) => ({ name, description })),
  };
  const answer = await requestStructured({
    schemaName: 'ability_rewrite',
    schema: REWRITE_SCHEMA,
    system: REWRITE_SYSTEM,
    user: JSON.stringify(payload),
    signal,
  });

  const byName = new Map(answer.abilities.map((a) => [a.name, a.description]));
  const textContext = { level: spec.level, spellTier: spec.spell?.tier };
  return {
    ...spec,
    specials: spec.specials.map((special) => {
      const rewritten = byName.get(special.name);
      if (!rewritten) return special;
      return { ...special, description: convertAbilityText(rewritten, textContext) };
    }),
  };
}


// --- Pathfinder First Edition transcription ---------------------------------

const PF1_PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'size', 'type', 'subtype', 'ac', 'hp', 'walkSpeed', 'otherSpeeds',
    'scores', 'saves', 'skills', 'resistances', 'immunities', 'vulnerabilities',
    'conditionImmunities', 'senses', 'languages', 'cr', 'gear', 'specials', 'attacks',
  ],
  properties: {
    name: { type: 'string' },
    size: { type: 'string', enum: ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'] },
    type: { type: 'string', description: 'The PF1e creature type, e.g. dragon, outsider, magical beast.' },
    subtype: { type: 'string', description: 'The parenthesised subtypes, or "" if none.' },
    ac: { type: 'integer', description: 'Full AC, not touch and not flat-footed.' },
    hp: { type: 'integer' },
    walkSpeed: { type: 'integer' },
    otherSpeeds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: {
          type: { type: 'string', enum: ['burrow', 'climb', 'fly', 'swim'] },
          value: { type: 'integer' },
        },
      },
    },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      properties: Object.fromEntries(
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, { type: 'integer' }]),
      ),
      description: 'Ability SCORES as printed. Use 0 for an ability printed as a dash.',
    },
    saves: {
      type: 'object',
      additionalProperties: false,
      required: ['fort', 'ref', 'will'],
      properties: { fort: { type: 'integer' }, ref: { type: 'integer' }, will: { type: 'integer' } },
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'bonus'],
        properties: { name: { type: 'string' }, bonus: { type: 'integer' } },
      },
      description: 'Include Perception, which PF1e prints on the Senses line.',
    },
    resistances: { type: 'array', items: { type: 'string' }, description: 'Energy resistance and DR, e.g. "acid 10", "5/magic".' },
    immunities: { type: 'array', items: { type: 'string' } },
    vulnerabilities: { type: 'array', items: { type: 'string' } },
    conditionImmunities: { type: 'array', items: { type: 'string' } },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'range'],
        properties: {
          type: { type: 'string', enum: ['darkvision', 'low-light-vision', 'blindsight', 'blindsense', 'tremorsense', 'scent'] },
          range: { type: 'integer', description: 'Feet; 0 when the sense has no printed range.' },
        },
      },
    },
    languages: { type: 'array', items: { type: 'string' } },
    cr: { type: 'string', description: 'Challenge Rating exactly as printed, e.g. "1/2" or "6".' },
    gear: { type: 'string', description: 'The gear line verbatim, or "" if there is none.' },
    specials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'description'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['Ex', 'Su', 'Sp', 'none'] },
          description: { type: 'string' },
        },
      },
    },
    attacks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'bonus', 'count', 'damage', 'damageType'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['melee', 'ranged'] },
          bonus: { type: 'integer', description: 'The FIRST bonus of an iterative sequence such as +11/+6.' },
          count: { type: 'integer', description: 'How many of this attack, e.g. 2 for "2 claws".' },
          damage: { type: 'string', description: 'Dice as printed, e.g. "1d8+5".' },
          damageType: { type: 'string', enum: ['bludgeoning', 'piercing', 'slashing'] },
        },
      },
    },
  },
};

const PF1_SYSTEM = [
  'You transcribe Pathfinder First Edition stat blocks into structured data.',
  'Copy every number exactly as printed; never estimate, repair or invent one.',
  'AC is the full value, not touch and not flat-footed. Abilities are the printed SCORES, not modifiers.',
  'For an attack printed with iteratives such as "+11/+6", give only the first bonus.',
].join(' ');

// --- Pathfinder Second Edition transcription --------------------------------

const PF2_PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'level', 'size', 'rarity', 'traits', 'perception', 'senses', 'languages',
    'skills', 'abilities', 'ac', 'saves', 'hp', 'landSpeed', 'otherSpeeds', 'items',
    'immunities', 'resistances', 'weaknesses', 'strikes', 'specials',
  ],
  properties: {
    name: { type: 'string' },
    level: { type: 'integer', description: 'The number after "Creature".' },
    size: { type: 'string', enum: ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'] },
    rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'unique'] },
    traits: { type: 'array', items: { type: 'string' }, description: 'Lowercase trait slugs from the trait line, excluding size and rarity.' },
    perception: { type: 'integer' },
    senses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'acuity', 'range'],
        properties: {
          type: { type: 'string' },
          acuity: { type: 'string', enum: ['precise', 'imprecise', 'vague'] },
          range: { type: 'integer', description: 'Feet; 0 when unlimited or unstated.' },
        },
      },
    },
    languages: { type: 'array', items: { type: 'string' } },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'mod'],
        properties: { name: { type: 'string' }, mod: { type: 'integer' } },
      },
    },
    abilities: {
      type: 'object',
      additionalProperties: false,
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      properties: Object.fromEntries(
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [key, { type: 'integer' }]),
      ),
      description: 'The printed modifiers.',
    },
    ac: { type: 'integer' },
    saves: {
      type: 'object',
      additionalProperties: false,
      required: ['fort', 'ref', 'will'],
      properties: { fort: { type: 'integer' }, ref: { type: 'integer' }, will: { type: 'integer' } },
    },
    hp: { type: 'integer' },
    landSpeed: { type: 'integer' },
    otherSpeeds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: {
          type: { type: 'string', enum: ['burrow', 'climb', 'fly', 'swim'] },
          value: { type: 'integer' },
        },
      },
    },
    items: { type: 'array', items: { type: 'string' } },
    immunities: { type: 'array', items: { type: 'string' } },
    resistances: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: { type: { type: 'string' }, value: { type: 'integer' } },
      },
    },
    weaknesses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: { type: { type: 'string' }, value: { type: 'integer' } },
      },
    },
    strikes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'bonus', 'damage', 'damageType', 'traits', 'rangeIncrement'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['melee', 'ranged'] },
          bonus: { type: 'integer' },
          damage: { type: 'string', description: 'The damage dice as printed, e.g. "2d8+9".' },
          damageType: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' }, description: 'Trait slugs; write reach as "reach-10".' },
          rangeIncrement: { type: 'integer', description: 'Feet for a ranged Strike, 0 for melee.' },
        },
      },
    },
    specials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'actionType', 'actions', 'description'],
        properties: {
          name: { type: 'string' },
          actionType: { type: 'string', enum: ['passive', 'action', 'reaction', 'free'] },
          actions: { type: 'integer', description: '1-3 for an action, 0 otherwise.' },
          description: { type: 'string' },
        },
      },
    },
  },
};

const PF2_SYSTEM = [
  'You transcribe Pathfinder Second Edition stat blocks into structured data.',
  'These numbers go onto the sheet exactly as you report them, so copy each one character for character.',
  'Never estimate, never recompute, never "fix" a value that looks wrong - transcribe what is printed.',
  'The trait line holds size, rarity and traits; do not repeat size or rarity in traits.',
].join(' ');

/** Transcribe a PF1e block into the shape parsepf1.js produces. */
export async function aiParsePF1e(text, { signal } = {}) {
  const raw = await requestStructured({
    schemaName: 'pf1e_stat_block_transcription',
    schema: PF1_PARSE_SCHEMA,
    system: PF1_SYSTEM,
    user: text,
    signal,
  });
  return pf1TranscriptionToData(raw);
}

/** Pure mapping, exported so tests cover it without an API in the room. */
export function pf1TranscriptionToData(raw) {
  const abilities = {};
  for (const [key, score] of Object.entries(raw.scores)) {
    abilities[key] = score > 0 ? Math.floor((score - 10) / 2) : -5;
  }
  const data = {
    system: 'pf1e',
    name: raw.name,
    size: raw.size,
    type: raw.type.toLowerCase(),
    subtype: raw.subtype ? raw.subtype.toLowerCase() : null,
    tags: '',
    ac: raw.ac,
    // PF1e prints the AC arithmetic here, which is not gear; leaving it empty
    // keeps the shared gear extractor from arming the creature with a "Dex".
    acNote: '',
    hp: raw.hp,
    hpFormula: '',
    gearLine: raw.gear ?? '',
    speeds: { walk: raw.walkSpeed || 25, others: raw.otherSpeeds },
    abilities,
    scores: { ...raw.scores },
    saves: { fort: raw.saves.fort, ref: raw.saves.ref, will: raw.saves.will },
    skills: raw.skills,
    resistances: raw.resistances,
    immunities: raw.immunities,
    vulnerabilities: raw.vulnerabilities,
    conditionImmunities: raw.conditionImmunities,
    senses: raw.senses,
    passivePerception: null,
    languages: raw.languages,
    cr: parseCR(raw.cr),
    crText: raw.cr,
    prof: 0,
    specials: (raw.specials ?? []).map((special) => ({
      name: special.name,
      section: /aura|immun|resist|regenerat|reduction/i.test(special.name) ? 'trait' : 'action',
      description: special.description,
    })),
    attacks: (raw.attacks ?? []).map((attack) => ({
      name: attack.name,
      kind: attack.kind,
      bonus: attack.bonus,
      reach: attack.kind === 'melee' ? 5 : null,
      range: null,
      count: Math.max(1, attack.count || 1),
      damage: [{ dice: attack.damage, average: diceAverage(attack.damage), type: attack.damageType }],
      text: `${attack.name} ${attack.damage}`,
    })),
    multiattack: null,
    spellcasting: null,
  };
  const counts = {};
  for (const attack of data.attacks) if (attack.count > 1) counts[attack.name.toLowerCase()] = attack.count;
  if (Object.keys(counts).length) data.multiattack = { counts, text: 'full attack' };
  return data;
}

/** Transcribe a PF2e block into a finished spec, values untouched. */
export async function aiParsePF2e(text, { signal } = {}) {
  const raw = await requestStructured({
    schemaName: 'pf2e_stat_block_transcription',
    schema: PF2_PARSE_SCHEMA,
    system: PF2_SYSTEM,
    user: text,
    signal,
  });
  return pf2TranscriptionToSpec(raw);
}

/** Pure mapping, exported for the same reason. */
export function pf2TranscriptionToSpec(raw) {
  const level = clampLevel(raw.level);
  const languages = mapLanguages(raw.languages ?? []);
  return {
    name: raw.name,
    level,
    size: raw.size,
    traits: (raw.traits ?? []).map((t) => String(t).toLowerCase().trim().replace(/\s+/g, '-')).filter(Boolean),
    rarity: raw.rarity,
    languages: languages.value,
    languageDetails: languages.details,
    description: '',
    sourceNote: `Transcribed by AI from a Pathfinder Second Edition stat block at level ${level}. `
      + 'Values were copied as printed rather than re-derived; check them against your source.',
    perception: { tier: null, mod: raw.perception },
    senses: (raw.senses ?? []).map((sense) => ({
      type: String(sense.type).toLowerCase().replace(/\s+/g, '-'),
      acuity: sense.acuity,
      ...(sense.range ? { range: sense.range } : {}),
    })),
    abilities: { ...raw.abilities },
    ac: { tier: null, value: raw.ac },
    saves: {
      fortitude: { tier: null, value: raw.saves.fort },
      reflex: { tier: null, value: raw.saves.ref },
      will: { tier: null, value: raw.saves.will },
    },
    hp: { tier: null, value: raw.hp },
    speeds: { land: raw.landSpeed || 25, others: raw.otherSpeeds ?? [] },
    strikes: (raw.strikes ?? []).map((strike) => ({
      name: strike.name,
      kind: strike.kind,
      tier: null,
      bonus: strike.bonus,
      damage: strike.damage,
      damageType: String(strike.damageType).toLowerCase(),
      extra: [],
      traits: (strike.traits ?? []).map((t) => String(t).toLowerCase().replace(/\s+/g, '-')),
      attackEffects: [],
      rangeIncrement: strike.kind === 'ranged' ? strike.rangeIncrement || 30 : null,
      rangeMax: null,
    })),
    skills: (raw.skills ?? []).map((skill) => ({
      slug: String(skill.name).toLowerCase().replace(/\s+/g, '-'),
      name: skill.name,
      tier: null,
      mod: skill.mod,
    })),
    spell: null,
    spellcasting: null,
    equipment: (raw.items ?? []).map((name) => ({ name: String(name).toLowerCase(), uuid: null })),
    specials: (raw.specials ?? []).map((special) => ({
      name: special.name,
      section: special.actionType === 'passive' ? 'trait' : 'action',
      actionType: special.actionType,
      actions: special.actionType === 'action' ? Math.min(Math.max(special.actions || 1, 1), 3) : null,
      category: special.actionType === 'passive' ? 'defensive' : 'offensive',
      description: special.description,
    })),
    immunities: (raw.immunities ?? []).map((t) => String(t).toLowerCase().replace(/\s+/g, '-')),
    resistances: (raw.resistances ?? []).map((r) => ({ type: String(r.type).toLowerCase().replace(/\s+/g, '-'), value: r.value })),
    weaknesses: (raw.weaknesses ?? []).map((w) => ({ type: String(w.type).toLowerCase().replace(/\s+/g, '-'), value: w.value })),
    tiers: {},
    direct: true,
  };
}

/** The schemas this module sends, exposed so check-schemas.mjs can audit them. */
export const SCHEMAS_FOR_TEST = {
  'transcription-5e': PARSE_SCHEMA,
  'transcription-pf1e': PF1_PARSE_SCHEMA,
  'transcription-pf2e': PF2_PARSE_SCHEMA,
  rewrite: REWRITE_SCHEMA,
};

/** The image prompt is assembled here, not typed by a model. */
export function portraitPrompt(spec) {
  const traits = [spec.size, ...spec.traits].filter(Boolean).join(', ');
  const flavour = spec.description?.trim()
    ? spec.description.trim().slice(0, 600)
    : `A fearsome creature called ${spec.name}.`;
  return [
    `Fantasy creature portrait of ${spec.name} (${traits}).`,
    flavour,
    'Painterly high-fantasy illustration, dramatic lighting, no text, no watermark, single creature, full body.',
  ].join(' ');
}
