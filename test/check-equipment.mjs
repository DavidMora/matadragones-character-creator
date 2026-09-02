/**
 * Gear extraction, the name map, and inventory attachment.
 *
 * The map is validated against a snapshot of the equipment compendium the
 * same way spell renames are: a target nobody can resolve is a silent empty
 * inventory, which looks exactly like the feature not existing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeCheck, load, root, installGlobals } from './harness.mjs';
import { FROST_REAVER } from './fixtures.mjs';

installGlobals();
const equip = await load('equipment.js');
const { parse5eStatBlock } = await load('parse5e.js');
const { convertCreature } = await load('convert.js');
const { check, done } = makeCheck();

// Both supported system versions - an item renamed between them would leave
// half the users with an empty inventory.
for (const version of ['7.12.2', '8.4.1']) {
  const catalogue = JSON.parse(
    readFileSync(path.join(root, 'test', `equipment-names-${version}.json`), 'utf8'),
  );
  check(`pf2e ${version} snapshot is a real index`, Object.keys(catalogue).length > 1000, true);
  const badTargets = Object.entries(equip.GEAR_MAP).filter(([, target]) => !(target in catalogue));
  check(`pf2e ${version}: every gear mapping targets a real item (bad: `
    + badTargets.map(([k, v]) => `${k}->${v}`).join(', ') + ')', badTargets.length, 0);
}

/*
 * Pinned entry by entry, not just "the target resolves": an audit changed
 * maul->greatclub and quarterstaff->longsword and every check still passed,
 * because a wrong weapon resolves exactly as well as a right one.
 */
check('every gear mapping is the item it should be', equip.GEAR_MAP, {
  battleaxe: 'battle axe',
  handaxe: 'hatchet',
  quarterstaff: 'staff',
  'light crossbow': 'crossbow',
  'hand crossbow': 'hand crossbow',
  'short sword': 'shortsword',
  shortsword: 'shortsword',
  'studded leather': 'studded leather armor',
  leather: 'leather armor',
  hide: 'hide armor',
  'ring mail': 'chain mail',
  'scale mail': 'scale mail',
  'chain shirt': 'chain shirt',
  'splint armor': 'splint mail',
  splint: 'splint mail',
  plate: 'full plate',
  'plate armor': 'full plate',
  'plate mail': 'full plate',
  'half plate': 'half plate',
  shield: 'steel shield',
  'wooden shield': 'wooden shield',
  greatclub: 'greatclub',
  maul: 'maul',
  morningstar: 'morningstar',
  sickle: 'sickle',
  scimitar: 'scimitar',
  'war pick': 'pick',
});

check('battleaxe spelling differs between the games', equip.normaliseGearName('Battleaxe'), 'battle axe');
check('a +1 weapon is still the base weapon', equip.normaliseGearName('+1 Longsword'), 'longsword');
check('plurals and articles trimmed', equip.normaliseGearName('Javelins'), 'javelin');
check('parentheticals dropped', equip.normaliseGearName('Longsword (two-handed)'), 'longsword');
check('natural armor is not an item', equip.normaliseGearName('natural armor'), null);
check('bare armor noise is not an item', equip.normaliseGearName('armor'), null);
check('unmapped names pass through lowercased', equip.normaliseGearName('Halberd'), 'halberd');

// --- Extraction from a parsed block ------------------------------------------
const armoured = parse5eStatBlock(`Iron Sentinel
Medium construct, neutral
Armor Class 18 (chain mail, shield)
Hit Points 60 (8d8 + 24)
Speed 25 ft.
STR 18 (+4) DEX 10 (+0) CON 16 (+3) INT 6 (-2) WIS 10 (+0) CHA 5 (-3)
Senses passive Perception 10
Languages -
Challenge 4 (1,100 XP)
Gear Longsword, Chain Mail, Steel Shield, Javelins (4)
Actions
Longsword. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) slashing damage.
Slam. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) bludgeoning damage.`).data;

check('gear line parsed', armoured.gearLine, 'Longsword, Chain Mail, Steel Shield, Javelins (4)');
check('AC parenthetical kept', armoured.acNote, 'chain mail, shield');
check('gear gathered from AC note, gear line and weapon strikes',
  equip.gearFromParsed(armoured),
  ['chain mail', 'steel shield', 'longsword', 'javelin']);
check('natural attacks are never inventory',
  equip.gearFromParsed(armoured).includes('slam'), false);

// A creature with only natural weapons and natural armour carries nothing.
const reaver = parse5eStatBlock(FROST_REAVER).data;
check('claws and bites produce no inventory', equip.gearFromParsed(reaver), []);

// --- The spec carries it, and nothing else moved -----------------------------
const armouredSpec = convertCreature(armoured);
check('spec exposes equipment as name/uuid pairs', armouredSpec.equipment, [
  { name: 'chain mail', uuid: null },
  { name: 'steel shield', uuid: null },
  { name: 'longsword', uuid: null },
  { name: 'javelin', uuid: null },
]);

// The Building Creatures promise: gear is descriptive. Strip it and every
// number must be identical.
const bare = convertCreature({ ...armoured, acNote: '', gearLine: '' });
check('gear does not touch AC', bare.ac.value, armouredSpec.ac.value);
check('gear does not touch strikes',
  JSON.stringify(bare.strikes), JSON.stringify(armouredSpec.strikes));
check('gear does not touch HP or saves',
  [bare.hp.value, bare.saves.fortitude.value], [armouredSpec.hp.value, armouredSpec.saves.fortitude.value]);

// --- Attachment --------------------------------------------------------------
const TYPES = { 'chain mail': 'armor', 'steel shield': 'shield', longsword: 'weapon', javelin: 'weapon' };
const fakeCompendium = (name) => (TYPES[name]
  ? { _id: 'packid', name, type: TYPES[name], system: { slug: name.replace(/ /g, '-'), quantity: 3, equipped: {} } }
  : null);

function fakeActor() {
  let counter = 0;
  const items = [];
  return {
    items,
    createEmbeddedDocuments: async (_type, sources) => sources.map((source) => {
      // Foundry assigns an id only when the source does not carry one, so
      // the fake must too - overwriting unconditionally made the
      // "compendium id dropped" assertion unfalsifiable.
      const clone = structuredClone(source);
      const created = { ...clone, _id: clone._id ?? `item${(counter += 1)}` };
      items.push(created);
      return created;
    }),
  };
}

const actor = fakeActor();
const result = await equip.attachGear(actor, armouredSpec, { findGear: fakeCompendium });
check('all four items created', [result.created, result.missing], [4, []]);
check('item types preserved', actor.items.map((i) => i.type), ['armor', 'shield', 'weapon', 'weapon']);
check('armour is worn in its slot', actor.items[0].system.equipped,
  { carryType: 'worn', handsHeld: 0, inSlot: true, invested: null });
check('weapons and shields are held', actor.items[1].system.equipped,
  { carryType: 'held', handsHeld: 1, invested: null });
// A maul held in one hand reports itself unequipped: pf2e compares handsHeld
// against the item's usage.
check('a two-handed weapon is held in two hands',
  equip.equippedState('weapon', { value: 'held-in-two-hands' }),
  { carryType: 'held', handsHeld: 2, invested: null });
check('a potion is not gripped in a fist',
  equip.equippedState('consumable', { value: 'held-in-one-hand' }),
  { carryType: 'worn', handsHeld: 0, invested: null });
check('quantity normalised to one', actor.items.map((i) => i.system.quantity), [1, 1, 1, 1]);
check('compendium id dropped', actor.items.every((i) => i._id.startsWith('item')), true);

const partial = fakeActor();
const partialResult = await equip.attachGear(partial, { equipment: ['longsword', 'moon-forged glaive'] }, { findGear: fakeCompendium });
check('unmatched gear reported, not invented', partialResult, { created: 1, missing: ['moon-forged glaive'] });

// A dropped item is cloned from its own document, not looked up by name.
const dropped = fakeActor();
const droppedResult = await equip.attachGear(
  dropped,
  { equipment: [{ name: 'longsword', uuid: 'Compendium.pf2e.equipment-srd.Item.abc' }] },
  {
    findGear: () => { throw new Error('name lookup should not happen for a dropped item'); },
    resolveUuid: async () => ({ _id: 'src', name: 'Ancestral Longsword', type: 'weapon', system: { quantity: 9, equipped: {} } }),
  },
);
check('dropped gear resolved by uuid', [droppedResult.created, dropped.items[0].name], [1, 'Ancestral Longsword']);
check('dropped gear still normalised', dropped.items[0].system.quantity, 1);

const empty = fakeActor();
check('a gearless creature makes no calls',
  await equip.attachGear(empty, { equipment: [] }, { findGear: fakeCompendium }), { created: 0, missing: [] });
check('gearless actor stays empty', empty.items.length, 0);

done('gear is extracted, resolvable, and purely descriptive');
