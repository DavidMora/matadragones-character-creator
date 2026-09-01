/**
 * The actor payload, against the pf2e schemas that were verified in the
 * system source: lore items for skills, melee items with damageRolls records
 * and a nullable range, action items with actionType/actions, remaster
 * perception under system.perception.
 */
import { makeCheck, load, installGlobals } from './harness.mjs';
import { SAMPLE_SPEC } from './fixtures.mjs';

installGlobals();
const { actorDataFromSpec } = await load('actor.js');
const { parse5eStatBlock } = await load('parse5e.js');
const { convertCreature } = await load('convert.js');
const { FROST_REAVER } = await import('./fixtures.mjs');
const { check, done } = makeCheck();

const data = actorDataFromSpec(SAMPLE_SPEC);

check('actor shell', [data.type, data.name], ['npc', 'Test Horror']);
check('level', data.system.details.level.value, 7);
check('abilities as mods', data.system.abilities.str, { mod: 5 });
check('ac', data.system.attributes.ac.value, 24);
check('hp value and max agree', [data.system.attributes.hp.value, data.system.attributes.hp.max], [115, 115]);
check('saves', [
  data.system.saves.fortitude.value,
  data.system.saves.reflex.value,
  data.system.saves.will.value,
], [18, 12, 15]);
check('perception is remaster-shaped', data.system.perception.mod, 18);
check('senses carry acuity and range', data.system.perception.senses, [
  { type: 'darkvision', acuity: 'precise', range: 60 },
]);
check('speed and other speeds', [
  data.system.attributes.speed.value,
  data.system.attributes.speed.otherSpeeds,
], [40, [{ type: 'climb', value: 30 }]]);
check('size and traits', [data.system.traits.size.value, data.system.traits.value], ['lg', ['beast']]);
check('languages', data.system.details.languages.value, ['common']);
check('iwr shapes', [
  data.system.attributes.immunities,
  data.system.attributes.resistances,
  data.system.attributes.weaknesses,
], [
  [{ type: 'poison' }, { type: 'fear-effects' }],
  [{ type: 'cold', value: 8 }],
  [{ type: 'fire', value: 8 }],
]);

// No legacy or invented fields: pf2e remaster has no alignment, and NPC
// attack ranges belong in system.range, not traits.
check('no alignment anywhere', JSON.stringify(data).includes('alignment'), false);

const melee = data.items.filter((i) => i.type === 'melee');
check('one melee item per strike', melee.length, 2);
check('bite bonus', melee[0].system.bonus.value, 18);
const biteRolls = Object.values(melee[0].system.damageRolls);
check('bite damage rolls include the rider', biteRolls, [
  { damage: '2d8+9', damageType: 'piercing', category: null },
  { damage: '2d6', damageType: 'cold', category: null },
]);
check('damageRolls keys are unique', new Set([
  ...Object.keys(melee[0].system.damageRolls),
  ...Object.keys(melee[1].system.damageRolls),
]).size, 3);
check('melee strike has null range', melee[0].system.range, null);
check('ranged strike carries range schema', melee[1].system.range, { increment: 30, max: 120 });
check('no range traits (legacy shape)', melee[1].system.traits.value.some((t) => t.startsWith('range')), false);

const lore = data.items.filter((i) => i.type === 'lore');
check('skills become lore items', lore.map((i) => [i.name, i.system.mod.value]), [['Athletics', 15]]);

const actions = data.items.filter((i) => i.type === 'action');
check('specials plus spellcasting note', actions.map((a) => a.name), ['Frozen Breath', 'Ice Shield', 'Spellcasting']);
check('two-action ability keeps its cost', [
  actions[0].system.actionType.value, actions[0].system.actions.value,
], ['action', 2]);
check('reaction has null actions', [
  actions[1].system.actionType.value, actions[1].system.actions.value,
], ['reaction', null]);
check('description markup is escaped, not injected',
  actions[0].system.description.value.includes('<b>'), false);
check('spellcasting note carries dc and attack',
  actions[2].system.description.value.includes('DC 22')
  && actions[2].system.description.value.includes('+14'), true);
check('source note lands in public notes',
  data.system.details.publicNotes.includes('Imported for tests.'), true);

// End to end: a parsed fixture converts and builds a payload without throwing,
// and every item type is one pf2e defines for NPCs.
const endToEnd = actorDataFromSpec(convertCreature(parse5eStatBlock(FROST_REAVER).data));
check('fixture end-to-end item types', [...new Set(endToEnd.items.map((i) => i.type))].sort(), ['action', 'lore', 'melee']);
check('fixture end-to-end level', endToEnd.system.details.level.value, 9);

done('actor payloads match the pf2e schemas');
