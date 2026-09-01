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
check('language details preserved (telepathy and the like)',
  data.system.details.languages.details, 'telepathy 100 feet');
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

/*
 * Skills are actor data, not items - a lore item named "Athletics" registers
 * as `athletics-lore` and leaves the real skill untrained, so the sheet reads
 * right while every Grapple, Trip and @Check rolls the bare ability modifier.
 */
check('skills live on the actor keyed by slug', data.system.skills, { athletics: { base: 15 } });
check('no lore items are emitted for core skills',
  data.items.filter((i) => i.type === 'lore').length, 0);

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
check('fixture end-to-end item types', [...new Set(endToEnd.items.map((i) => i.type))].sort(), ['action', 'melee']);
check('fixture end-to-end skills are actor data',
  Object.keys(endToEnd.system.skills).sort(), ['athletics', 'stealth']);
check('fixture end-to-end level', endToEnd.system.details.level.value, 9);

// --- Spellcasting realisation ------------------------------------------------
const { attachSpellcasting, entrySource, spellSource, spellSlug } = await load('spells.js');
const { GLOOM_CALLER } = await import('./fixtures.mjs');

check('slugging matches pf2e convention', spellSlug("Summoner's Precaution"), 'summoners-precaution');

/** A pretend compendium: knows every spell except phantasmal killer. */
const fakeCompendium = (name) => (name === 'phantasmal killer' ? null : {
  _id: 'packid',
  name: name.replace(/\b\w/g, (ch) => ch.toUpperCase()),
  type: 'spell',
  system: {
    slug: spellSlug(name),
    level: { value: name === 'caustic blast' || name === 'telekinetic hand' ? 1 : 4 },
    traits: { value: name === 'caustic blast' || name === 'telekinetic hand' ? ['cantrip'] : [] },
    location: { value: null },
  },
});

/** Records createEmbeddedDocuments calls and hands back ids like Foundry. */
function fakeActor() {
  let counter = 0;
  const items = [];
  return {
    items,
    createEmbeddedDocuments: async (_type, sources) => sources.map((source) => {
      const created = { ...structuredClone(source), _id: `item${(counter += 1)}` };
      items.push(created);
      return created;
    }),
  };
}

const casterSpec = convertCreature(parse5eStatBlock(GLOOM_CALLER).data);
const target = fakeActor();
const result = await attachSpellcasting(target, casterSpec, { findSpell: fakeCompendium });

const entryItems = target.items.filter((i) => i.type === 'spellcastingEntry');
const spellItems = target.items.filter((i) => i.type === 'spell');
check('both entries created', entryItems.map((i) => [i.name, i.system.prepared.value]),
  [['Innate Spellcasting', 'innate'], ['Spellcasting', 'spontaneous']]);
check('entry carries dc/attack/tradition', [
  entryItems[0].system.spelldc, entryItems[0].system.tradition.value,
], [{ value: casterSpec.spellcasting.entries[0].attack, dc: casterSpec.spellcasting.entries[0].dc }, 'divine']);
check('spontaneous entry has its slots', entryItems[1].system.slots, {
  slot1: { value: 4, max: 4, prepared: [] },
  slot2: { value: 3, max: 3, prepared: [] },
  slot3: { value: 2, max: 2, prepared: [] },
});
check('unknown spell reported, not invented', result.missing, ['phantasmal killer']);
check('the rest created and counted', [result.created, spellItems.length], [9, 9]);

const filedUnder = new Set(spellItems.map((s) => s.system.location.value));
check('spells filed under their entries', [...filedUnder].sort(), [entryItems[0]._id, entryItems[1]._id].sort());

const atWill = spellItems.find((s) => s.name.startsWith('Translocate'));
check('at-will leveled spell suffixed like official data, no uses',
  [atWill.name, atWill.system.location.uses], ['Translocate (At Will)', undefined]);
const perDay = spellItems.find((s) => s.name.startsWith('Paralyze'));
check('per-day spell carries uses', perDay.system.location.uses, { value: 3, max: 3 });
const cantrip = spellItems.find((s) => s.name.startsWith('Telekinetic Hand'));
check('cantrip needs no suffix and no uses',
  [cantrip.name, cantrip.system.location.uses], ['Telekinetic Hand', undefined]);
check('cloned source drops its compendium id', spellItems.every((s) => s._id.startsWith('item')), true);

// The pure builders behave without an actor in the room.
const entry = entrySource({ name: 'X', category: 'innate', tradition: 'occult', ability: 'cha', dc: 20, attack: 12, slots: {}, spells: [] });
check('innate entry omits slots entirely', 'slots' in entry.system, false);
const constant = spellSource(fakeCompendium('mist'), 'e1', { name: 'mist', uses: null, atWill: false, constant: true });
check('constant spells suffixed', constant.name, 'Mist (Constant)');

// A spec with real entries must not also get the prose Spellcasting note...
const casterData = actorDataFromSpec(casterSpec);
check('no prose spellcasting note beside real entries',
  casterData.items.some((i) => i.type === 'action' && i.name === 'Spellcasting'), false);
// ...while a DC-only creature (no parseable list) still gets the note.
check('DC-only creature keeps the note',
  actorDataFromSpec(SAMPLE_SPEC).items.some((i) => i.name === 'Spellcasting'), true);

check('attack effects reach the melee item',
  actorDataFromSpec(casterSpec).items.find((i) => i.type === 'melee').system.attackEffects.value, ['grab']);

// No spellcasting, no calls: a spell-less spec touches nothing.
const untouched = fakeActor();
check('spell-less spec makes no embedded calls',
  await attachSpellcasting(untouched, convertCreature(parse5eStatBlock(FROST_REAVER).data), { findSpell: fakeCompendium }),
  { created: 0, missing: [] });
check('spell-less actor has no items added', untouched.items.length, 0);

done('actor payloads match the pf2e schemas');
