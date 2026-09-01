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
import { reparseSpecials } from '../parse5e.js';

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
