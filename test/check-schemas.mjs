/**
 * Structured Outputs strict mode, over every schema the module sends.
 *
 * The API enforces two rules the schemas must satisfy, and breaking either
 * is a 400 the GM sees only after typing a brief and pressing the button:
 *
 *   - every object must list *every* key of `properties` in `required`;
 *   - every object must set `additionalProperties: false`.
 *
 * A property added without its `required` entry - exactly what happened to
 * `gear` - is invisible in review and fatal at runtime, so it is asserted
 * here instead of discovered there.
 *
 * The third rule is this module's own: no schema may let a model write a
 * number that belongs to the tables.
 */
import { makeCheck, load, installGlobals } from './harness.mjs';

installGlobals();
const { CONCEPT_SCHEMA } = await load('ai/concept.js');
const assist = await load('ai/assist.js');
const { check, done } = makeCheck();

/** Walk every object node in a JSON schema, with a readable path. */
function* objects(node, path = '$') {
  if (!node || typeof node !== 'object') return;
  const types = [node.type].flat();
  if (types.includes('object') && node.properties) yield [path, node];
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    yield* objects(value, `${path}.${key}`);
  }
  if (node.items) yield* objects(node.items, `${path}[]`);
}

const SCHEMAS = { concept: CONCEPT_SCHEMA, ...assist.SCHEMAS_FOR_TEST };

for (const [name, schema] of Object.entries(SCHEMAS)) {
  for (const [path, node] of objects(schema, name)) {
    const properties = Object.keys(node.properties);
    const required = node.required ?? [];
    const missing = properties.filter((key) => !required.includes(key));
    check(`${path}: every property is required (missing: ${missing.join(', ')})`, missing, []);

    const extra = required.filter((key) => !properties.includes(key));
    check(`${path}: nothing required that does not exist (stray: ${extra.join(', ')})`, extra, []);

    check(`${path}: additionalProperties is false`, node.additionalProperties, false);
  }
}

/*
 * The module's own rule. A model may name a spell, describe an ability or
 * pick a tier; it may never state a value the Building Creatures tables own.
 * `speed` and sense `range` are the deliberate exceptions - PF2e publishes no
 * table for either, so there is nothing for a number to contradict.
 */
/*
 * An allowlist, not a denylist. The previous version matched forbidden names
 * exactly, so `armorClass`, `hitPointTotal` and `strikeDamageDice` all
 * slipped through - an audit added those three fields and the suite stayed
 * green. Inverting it means a new numeric field fails until someone
 * deliberately records why a model may supply it.
 *
 * The two allowed numbers are the ones PF2e publishes no table for, so there
 * is nothing for them to contradict.
 */
const ALLOWED_NUMERIC = new Set([
  'concept.speed',          // no Speed table exists in Building Creatures
  'concept.senses[].range', // nor a table of sense ranges
]);

for (const [name, schema] of Object.entries(SCHEMAS)) {
  /*
   * Transcription schemas are the one place numbers are the point - they copy
   * a printed stat block. Two different things keep them honest: for a
   * converted source the conversion re-derives every value anyway, and for a
   * direct one (PF2e, where the numbers really do reach the sheet)
   * plausibility.js checks them against the published span for the level.
   */
  if (name.startsWith('transcription')) continue;
  for (const [path, node] of objects(schema, name)) {
    for (const [key, value] of Object.entries(node.properties)) {
      const full = `${path}.${key}`;
      const types = [value.type].flat();
      if (!types.includes('integer') && !types.includes('number')) continue;
      check(`${full}: a model may not supply a number the tables own`,
        ALLOWED_NUMERIC.has(full), true);
    }
  }
}

// AC and HP appear in the concept schema only as tier choices - the words
// are there, the numbers are not.
const tierProps = CONCEPT_SCHEMA.properties.tiers.properties;
check('AC and HP are tier enums, not values', [
  [tierProps.ac.type, Array.isArray(tierProps.ac.enum)],
  [tierProps.hp.type, Array.isArray(tierProps.hp.enum)],
], [['string', true], ['string', true]]);
check('the concept schema has no field for a DC or an attack bonus',
  Object.keys(CONCEPT_SCHEMA.properties).filter((k) => /dc|bonus|modifier/i.test(k)), []);

done('every schema satisfies strict mode and the no-numbers rule');
