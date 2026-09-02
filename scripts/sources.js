/**
 * The stat block sources the importer accepts.
 *
 * Two kinds, and the distinction matters more than the parsers do:
 *
 * - A **converted** source describes a different game. Its printed numbers
 *   mean nothing here, so each is classified into a tier against what that
 *   system expects at that challenge rating, and the value on the sheet is
 *   read from the Building Creatures tables. This is the 5e and PF1e path.
 * - A **direct** source is already Pathfinder Second Edition. Its numbers are
 *   this system's numbers, so they are transcribed unchanged. Running them
 *   through the tier machinery would take an exact creature and round it to
 *   the nearest tier - a downgrade dressed up as a conversion.
 *
 * Everything else about the two paths is shared: the same actor builder, the
 * same compendium resolution, the same preview.
 */
import { parse5eStatBlock } from './parse5e.js';
import { parsePF1eStatBlock } from './parsepf1.js';
import { parsePF2eStatBlock } from './parsepf2.js';
import { levelFromCR as levelFrom5eCR } from './baseline5e.js';
import { levelFromCR as levelFromPF1CR } from './baselinepf1.js';
import { aiParseStatBlock, aiParsePF1e, aiParsePF2e } from './ai/assist.js';

export const SOURCES = {
  dnd5e: {
    id: 'dnd5e',
    label: 'MCC.Source.Dnd5e',
    hint: 'MCC.Source.Dnd5eHint',
    placeholder: 'MCC.Source.Dnd5ePlaceholder',
    mode: 'converted',
    parse: parse5eStatBlock,
    aiParse: aiParseStatBlock,
    levelFor: (data) => levelFrom5eCR(data.cr),
  },
  pf1e: {
    id: 'pf1e',
    label: 'MCC.Source.Pf1e',
    hint: 'MCC.Source.Pf1eHint',
    placeholder: 'MCC.Source.Pf1ePlaceholder',
    mode: 'converted',
    parse: parsePF1eStatBlock,
    aiParse: aiParsePF1e,
    levelFor: (data) => levelFromPF1CR(data.cr),
  },
  pf2e: {
    id: 'pf2e',
    label: 'MCC.Source.Pf2e',
    hint: 'MCC.Source.Pf2eHint',
    placeholder: 'MCC.Source.Pf2ePlaceholder',
    mode: 'direct',
    parse: parsePF2eStatBlock,
    aiParse: aiParsePF2e,
    levelFor: (spec) => spec.level,
  },
};

export const DEFAULT_SOURCE = 'dnd5e';

export function sourceById(id) {
  return SOURCES[id] ?? SOURCES[DEFAULT_SOURCE];
}

/** True when this source's numbers are already Pathfinder Second Edition. */
export function isDirect(id) {
  return sourceById(id).mode === 'direct';
}

/**
 * Transcribe with the model, in whichever shape this source uses. A
 * converted source returns the intermediate data; a direct one returns a
 * finished spec, exactly as the deterministic parsers do.
 */
export async function aiParseWith(id, text, options) {
  const source = sourceById(id);
  const result = await source.aiParse(text, options);
  return source.mode === 'direct'
    ? { data: null, spec: result, mode: 'direct' }
    : { data: result, spec: null, mode: 'converted' };
}

/**
 * Parse text with the chosen source. Returns a common envelope so the view
 * does not branch on the source: `{ ok, missing, data, spec }`, where a
 * converted source fills `data` (to be classified) and a direct source fills
 * `spec` (already finished).
 */
export function parseWith(id, text) {
  const source = sourceById(id);
  const result = source.parse(text);
  return {
    ok: result.ok,
    missing: result.missing,
    data: result.data ?? null,
    spec: result.spec ?? null,
    mode: source.mode,
  };
}
