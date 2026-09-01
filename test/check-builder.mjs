/**
 * The build-from-scratch path: encounter budgets, the creature-building
 * guardrails, drag-and-drop bookkeeping, and the AI concept mapping.
 *
 * The load-bearing promise here is the same one the importer makes - the
 * model contributes a concept, never a number - so the sharpest tests are the
 * ones that hand `conceptToDraft` an over-tuned concept and check it comes
 * back inside the rules.
 */
import { makeCheck, load, installGlobals } from './harness.mjs';

installGlobals();
const encounter = await load('encounter.js');
const rules = await load('creature-rules.js');
const drops = await load('drops.js');
const { conceptToDraft } = await load('ai/concept.js');
const { specFromBuilder, seedFromRoadMap } = await load('convert.js');
const tables = await load('tables.js');
const { check, done } = makeCheck();

// --- Encounter budgets -------------------------------------------------------
check('xp by level difference matches the published table', [
  encounter.creatureXP(5, 1), encounter.creatureXP(5, 3), encounter.creatureXP(5, 4),
  encounter.creatureXP(5, 5), encounter.creatureXP(5, 6), encounter.creatureXP(5, 7),
  encounter.creatureXP(5, 8),
], [10, 20, 30, 40, 60, 80, 120]);
check('differences beyond the table clamp to its ends',
  [encounter.creatureXP(10, 1), encounter.creatureXP(1, 20)], [10, 160]);
check('budgets scale at 20 XP a character', encounter.encounterBudgets(4),
  { trivial: 40, low: 60, moderate: 80, severe: 120, extreme: 160 });
check('a five-person party has a bigger budget', encounter.encounterBudgets(5).moderate, 100);
check('ratings read off the budgets', [
  encounter.rateEncounter(40, 4), encounter.rateEncounter(80, 4),
  encounter.rateEncounter(120, 4), encounter.rateEncounter(200, 4),
], ['trivial', 'moderate', 'severe', 'extreme']);

check('roles map to published relative levels', Object.keys(encounter.ROLES).map(
  (role) => encounter.levelForRole(5, role),
), [8, 7, 6, 5, 3, 1]);
check('role levels clamp to the creature tables', encounter.levelForRole(23, 'solo'), 24);

// "Challenge my 5th level party" with a boss: level 7, 80 XP, severe alone.
const boss = encounter.budgetSummary(5, 4, encounter.levelForRole(5, 'boss'));
check('a boss for a level 5 party of four', [boss.xp, boss.alone, boss.fitModerate], [80, 'moderate', 1]);
const solo = encounter.budgetSummary(5, 4, encounter.levelForRole(5, 'solo'));
check('a solo boss is a severe fight on its own', [solo.xp, solo.alone], [120, 'severe']);

// --- Guardrails --------------------------------------------------------------
// Every published road map must pass its own rules; a band that excluded the
// book would be a bug in the band, not in the book.
for (const [name, map] of Object.entries(tables.ROAD_MAPS)) {
  const draft = { ...map, level: 5, abilities: map.abilities };
  const { errors, warnings } = rules.validateDraft(draft);
  check(`road map ${name} raises no errors`, errors, []);
  check(`road map ${name} is inside the published band`,
    warnings.some((w) => w.key === 'budget'), false);
}

/*
 * The loop above cannot fail by construction - publishedBand() is computed
 * FROM ROAD_MAPS, so any road map is inside it by definition. An audit
 * turned `soldier` into a two-extreme monster and the loop stayed green.
 * Pinning the band and each road map's score as literals is what actually
 * catches a road map, or the scoring, drifting.
 */
check('the published band is exactly this', rules.publishedBand(), { min: 0, max: 4 });
check('each road map scores what the book implies', Object.fromEntries(
  Object.entries(tables.ROAD_MAPS).map(([name, map]) => [name, rules.budgetScore(map)]),
), {
  balanced: 0, brute: 0, sniper: 1, skirmisher: 0, soldier: 4,
  'magical-striker': 2, spellcaster: 0,
});
check('tier points are the documented weights', [
  rules.budgetScore({ ac: 'extreme' }), rules.budgetScore({ ac: 'high' }),
  rules.budgetScore({ ac: 'moderate' }), rules.budgetScore({ ac: 'low' }),
  rules.budgetScore({ ac: 'terrible' }),
], [2, 1, 0, -1, -2]);

const overtuned = {
  level: 5, perception: 'extreme', ac: 'extreme', fortitude: 'extreme', reflex: 'high',
  will: 'high', hp: 'high', attack: 'extreme', damage: 'extreme', spell: 'extreme',
  abilities: { str: 'extreme', dex: 'high', con: 'high', int: 'moderate', wis: 'moderate', cha: 'high' },
};
const verdict = rules.validateDraft(overtuned);
check('too many extremes is an error', verdict.errors.some((e) => e.key === 'extremes'), true);
check('over-budget warns', verdict.warnings.some((w) => w.key === 'budget'), true);
check('a creature with no weakness warns', verdict.warnings.some((w) => w.key === 'nogaps'), true);

// The over-tuned fixture has six extremes, so it trips any `> N` for N < 6;
// these probe the boundary the rule actually claims.
const withExtremes = (count) => {
  const keys = ['damage', 'attack', 'ac', 'hp', 'perception', 'fortitude'];
  const draft = { level: 5, perception: 'moderate', ac: 'moderate', fortitude: 'moderate',
    reflex: 'moderate', will: 'moderate', hp: 'moderate', attack: 'moderate', damage: 'moderate',
    spell: null, abilities: { str: 'moderate', dex: 'moderate', con: 'moderate', int: 'moderate', wis: 'moderate', cha: 'moderate' } };
  for (const key of keys.slice(0, count)) draft[key] = key === 'hp' ? 'high' : 'extreme';
  return draft;
};
check('one extreme is fine', rules.validateDraft(withExtremes(1)).errors, []);
check('two extremes warn but do not block', [
  rules.validateDraft(withExtremes(2)).errors.length,
  rules.validateDraft(withExtremes(2)).warnings.some((w) => w.key === 'extremes'),
], [0, true]);
check('three extremes is an error', rules.validateDraft(withExtremes(3)).errors.some((e) => e.key === 'extremes'), true);
check('level boundaries: -1 and 24 pass, -2 and 25 do not', [
  rules.validateDraft({ ...withExtremes(0), level: -1 }).errors.length,
  rules.validateDraft({ ...withExtremes(0), level: 24 }).errors.length,
  rules.validateDraft({ ...withExtremes(0), level: -2 }).errors.some((e) => e.key === 'level'),
  rules.validateDraft({ ...withExtremes(0), level: 25 }).errors.some((e) => e.key === 'level'),
], [0, 0, true, true]);

const enforced = rules.enforceDraft(overtuned);
check('enforcement leaves exactly two extremes', rules.extremeCount(enforced.draft), 2);
check('offence keeps its signature', [enforced.draft.damage, enforced.draft.attack], ['extreme', 'extreme']);
check('enforcement reports every change', enforced.corrections.length > 0, true);
check('an enforced draft passes the hard rules', rules.validateDraft(enforced.draft).errors, []);

const nonsense = rules.enforceDraft({
  level: 99, perception: 'godlike', ac: 'terrible', fortitude: 'high', reflex: 'moderate',
  will: 'low', hp: 'extreme', attack: 'moderate', damage: 'moderate', spell: 'low',
  abilities: { str: 'terrible', dex: 'moderate', con: 'moderate', int: 'moderate', wis: 'moderate', cha: 'moderate' },
});
check('AC has no terrible column, so it snaps to low', nonsense.draft.ac, 'low');
check('HP has no extreme column, so it snaps to high', nonsense.draft.hp, 'high');
check('spell DCs stop at moderate', nonsense.draft.spell, 'moderate');
check('an unknown tier becomes moderate', nonsense.draft.perception, 'moderate');
check('abilities have no terrible column', nonsense.draft.abilities.str, 'moderate');
check('level is clamped into the tables', nonsense.draft.level, 24);

// --- Drops -------------------------------------------------------------------
check('item types route to buckets', [
  drops.bucketFor('spell'), drops.bucketFor('action'), drops.bucketFor('feat'),
  drops.bucketFor('weapon'), drops.bucketFor('armor'), drops.bucketFor('melee'),
  drops.bucketFor('npc'),
], ['spells', 'specials', 'specials', 'gear', 'gear', 'strikes', null]);

check('a non-JSON drop is ignored quietly',
  drops.readDropData({ dataTransfer: { getData: () => 'not json' } }), null);
check('an empty drop is ignored quietly',
  drops.readDropData({ dataTransfer: { getData: () => '' } }), null);
check('a Foundry drop parses',
  drops.readDropData({ dataTransfer: { getData: () => '{"type":"Item","uuid":"Compendium.x.Item.y"}' } }),
  { type: 'Item', uuid: 'Compendium.x.Item.y' });

const spellItem = {
  type: 'spell', uuid: 'Compendium.pf2e.spells-srd.Item.abc', name: 'Fireball', img: 'x.webp',
  system: { level: { value: 3 }, traits: { value: ['fire'] } },
};
check('a dropped spell keeps its rank and uuid', drops.describeDropped(spellItem), {
  bucket: 'spells', uuid: 'Compendium.pf2e.spells-srd.Item.abc', name: 'Fireball', img: 'x.webp',
  type: 'spell', rank: 3, cantrip: false, uses: null, atWill: false, constant: false,
});
const cantrip = drops.describeDropped({ ...spellItem, name: 'Ignition', system: { level: { value: 1 }, traits: { value: ['cantrip', 'fire'] } } });
check('a dropped cantrip is at will', [cantrip.cantrip, cantrip.atWill], [true, true]);
check('an undroppable type is refused', drops.describeDropped({ type: 'npc', name: 'x' }), null);

const actionItem = {
  type: 'action', uuid: 'Compendium.pf2e.actionspf2e.Item.def', name: 'Grab', img: 'a.webp',
  system: { actionType: { value: 'free' }, actions: { value: null }, category: 'offensive', description: { value: '<p>Grabs.</p>' } },
};
const special = drops.droppedToSpecial(drops.describeDropped(actionItem), actionItem);
check('a dropped action keeps its cost and text',
  [special.actionType, special.description, special.uuid],
  ['free', '<p>Grabs.</p>', 'Compendium.pf2e.actionspf2e.Item.def']);

const draft = { contents: { spells: [], specials: [], gear: [] } };
check('a drop is added', drops.addDrop(draft, drops.describeDropped(spellItem)), true);
check('the same item twice is refused', drops.addDrop(draft, drops.describeDropped(spellItem)), false);
check('one entry stored', draft.contents.spells.length, 1);

// --- Dropped items reach the spec --------------------------------------------
const built = {
  ...seedFromRoadMap('spellcaster', 6),
  name: 'Dropper', size: 'med', rarity: 'common', traits: [], speed: 25,
  description: '', tradition: 'occult', senses: [], languages: ['Common'],
  strikes: [{ name: 'Staff', kind: 'melee', damageType: 'bludgeoning' }], skills: [],
  contents: {
    spells: [drops.describeDropped(spellItem)],
    specials: [special],
    gear: [
      { bucket: 'gear', uuid: null, name: 'longsword' },
      drops.describeDropped({ type: 'weapon', uuid: 'Compendium.x.Item.axe', name: 'Battle Axe', system: {} }),
    ],
  },
};
const spec = specFromBuilder(built);
check('dropped spell lands in the entry with its uuid',
  spec.spellcasting.entries[0].spells,
  [{ name: 'fireball', uuid: 'Compendium.pf2e.spells-srd.Item.abc', uses: null, atWill: false, constant: false, heightenTo: 3 }]);
// A creature casts at half its level rounded up, so its innate spells are
// heightened rather than left at their printed rank.
check('spells carry the rank the creature casts at', [
  (await load('convert.js')).maxSpellRank(1), (await load('convert.js')).maxSpellRank(6),
  (await load('convert.js')).maxSpellRank(16), (await load('convert.js')).maxSpellRank(24),
], [1, 3, 8, 10]);
check('entry uses the chosen tradition and table DC',
  [spec.spellcasting.entries[0].tradition, spec.spellcasting.entries[0].dc],
  ['occult', tables.spellDCFor(6, 'high')]);
check('dropped ability lands in specials with its uuid',
  spec.specials.map((s) => [s.name, s.uuid]), [['Grab', 'Compendium.pf2e.actionspf2e.Item.def']]);
// The weapon a Strike is named for, then everything on the gear list.
check('strike weapon, listed gear and dropped gear all land',
  spec.equipment, [
    { name: 'staff', uuid: null },
    { name: 'longsword', uuid: null },
    { name: 'Battle Axe', uuid: 'Compendium.x.Item.axe' },
  ]);
check('builder languages map to slugs', spec.languages, ['common']);

// --- Concept mapping ---------------------------------------------------------
const concept = {
  name: 'Grave-Speaker Malith',
  description: 'A necromancer who calls the fallen back mid-fight.',
  size: 'med', rarity: 'unique',
  traits: ['Humanoid', 'evil', 'Undead Lord', '!!bad!!'],
  roadMap: 'spellcaster',
  tiers: {
    perception: 'high', ac: 'extreme', fortitude: 'low', reflex: 'moderate', will: 'extreme',
    hp: 'low', attack: 'extreme', damage: 'extreme', spell: 'extreme',
  },
  abilities: { str: 'low', dex: 'moderate', con: 'moderate', int: 'extreme', wis: 'high', cha: 'high' },
  speed: 27,
  strikes: [{ name: 'Withering Touch', kind: 'melee', damageType: 'void' }],
  skills: [{ slug: 'occultism', tier: 'high' }, { slug: 'occultism', tier: 'low' }],
  senses: [{ type: 'darkvision', range: 60 }, { type: 'scent', range: 30 }],
  languages: ['Common', 'Necril'],
  gear: ['Bone Staff', 'Tattered Robes'],
  spellcasting: {
    tradition: 'divine',
    category: 'prepared',
    spells: [
      { name: 'animate dead', frequency: '2-per-day' },
      { name: 'chill touch', frequency: 'at-will' },
    ],
  },
  specials: [{ name: 'Raise the Fallen', actionType: 'action', description: 'A DC Fortitude save or rise.' }],
};

const { draft: conceptDraft, corrections } = conceptToDraft(concept, 7);
check('level is the caller\'s, never the model\'s', conceptDraft.level, 7);
check('surplus extremes corrected down to two', rules.extremeCount(conceptDraft), 2);
check('corrections are reported', corrections.length > 0, true);
check('an enforced concept passes the rules', rules.validateDraft(conceptDraft).errors, []);
check('alignment and malformed traits stripped', conceptDraft.traits, ['humanoid', 'undead-lord']);
check('speed rounded to a multiple of five', conceptDraft.speed, 25);
check('duplicate skills collapse, first wins', conceptDraft.skills, [{ slug: 'occultism', tier: 'high' }]);
check('senses carry acuity', conceptDraft.senses, [
  { type: 'darkvision', acuity: 'precise', range: 60 },
  { type: 'scent', acuity: 'imprecise', range: 30 },
]);
// The concept fills the very lists the builder panel renders, so the GM can
// tune what the model proposed instead of taking it or leaving it.
check('concept spells land in the editable list, remastered', conceptDraft.contents.spells, [
  { bucket: 'spells', uuid: null, name: 'summon undead', uses: 2, atWill: false, constant: false },
  { bucket: 'spells', uuid: null, name: 'void warp', uses: null, atWill: true, constant: false },
]);
check('concept abilities land in the editable list',
  conceptDraft.contents.specials.map((s) => [s.name, s.actionType, s.bucket]),
  [['Raise the Fallen', 'action', 'specials']]);
check('concept gear lands in the editable list',
  conceptDraft.contents.gear.map((g) => g.name), ['bone staff', 'tattered robes']);
check('a dropped item merges into the same list as concept spells', (() => {
  const merged = { contents: structuredClone(conceptDraft.contents) };
  drops.addDrop(merged, drops.describeDropped(spellItem));
  return merged.contents.spells.map((s) => s.name);
})(), ['summon undead', 'void warp', 'Fireball']);

const conceptSpec = specFromBuilder(conceptDraft);
check('concept spell DC comes from the table, not the model',
  conceptSpec.spellcasting.entries[0].dc, tables.spellDCFor(7, conceptDraft.spell));
check('concept ability text gets a real DC',
  conceptSpec.specials[0].description.includes(`DC ${tables.spellDCFor(7, conceptDraft.spell)}`), true);
check('concept strikes are statted from the tables',
  [conceptSpec.strikes[0].bonus, conceptSpec.strikes[0].damage],
  [tables.strikeBonusFor(7, conceptDraft.attack), tables.strikeDamageFor(7, conceptDraft.damage).dice]);
check('concept languages mapped to slugs', conceptSpec.languages, ['common', 'necril']);

// --- A caster must actually get spells ---------------------------------------
const { needsSpells } = await load('ai/concept.js');
check('a spell tier with no list is the failure worth retrying',
  needsSpells({ tiers: { spell: 'high' }, spellcasting: null }), true);
check('a spell tier with an empty list counts too',
  needsSpells({ tiers: { spell: 'high' }, spellcasting: { spells: [] } }), true);
check('a non-caster needs nothing', needsSpells({ tiers: { spell: null }, spellcasting: null }), false);
check('a caster with spells is fine',
  needsSpells({ tiers: { spell: 'high' }, spellcasting: { spells: [{ name: 'acid grip' }] } }), false);

// A wizard is a prepared caster, and its entry says so.
const wizardSpec = specFromBuilder(conceptDraft);
check('the concept chooses how it casts', [
  wizardSpec.spellcasting.entries[0].category,
  wizardSpec.spellcasting.entries[0].name,
], ['prepared', 'Spellcasting']);
check('a prepared entry asks for slots from its spells',
  wizardSpec.spellcasting.entries[0].slotsFromSpells, true);

// Slots are counted from the ranks that actually resolved, cantrips at 0.
const spellsModule = await load('spells.js');
const { slotsForSpells, rankOf, attachSpellcasting } = spellsModule;

check('cantrips sit at rank 0, others at their own', [
  rankOf({ system: { level: { value: 1 }, traits: { value: ['cantrip'] } } }),
  rankOf({ system: { level: { value: 3 }, traits: { value: [] } } }),
], [0, 3]);

const madeSpells = [
  { _id: 'a', system: { level: { value: 1 }, traits: { value: ['cantrip'] } } },
  { _id: 'b', system: { level: { value: 3 }, traits: { value: [] } } },
  { _id: 'c', system: { level: { value: 3 }, traits: { value: [] } } },
];
// A prepared slot must name the spell prepared into it, or the sheet shows
// "Empty Slot (drag spell here)" beside a creature that has the spell.
check('prepared slots name their spells', slotsForSpells(madeSpells, 'prepared'), {
  slot0: { max: 1, prepared: [{ id: 'a' }] },
  slot3: { max: 2, value: 2, prepared: [{ id: 'b' }, { id: 'c' }] },
});
check('spontaneous slots are counts, not preparations', slotsForSpells(madeSpells, 'spontaneous'), {
  slot0: { max: 1, value: 1, prepared: [] },
  slot3: { max: 2, value: 2, prepared: [] },
});

// End to end: a prepared caster's entry comes out with its slots filled by
// the spells that were actually created on the actor.
function fakeCastingActor() {
  let counter = 0;
  const items = [];
  const updates = [];
  return {
    items,
    updates,
    createEmbeddedDocuments: async (_type, sources) => sources.map((source) => {
      const clone = structuredClone(source);
      const created = { ...clone, _id: clone._id ?? `made${(counter += 1)}` };
      items.push(created);
      return created;
    }),
    updateEmbeddedDocuments: async (_type, changes) => { updates.push(...changes); return changes; },
  };
}

const preparedSpec = specFromBuilder({
  ...conceptDraft,
  contents: {
    ...conceptDraft.contents,
    spells: [
      { name: 'acid grip', uses: null, atWill: false, constant: false },
      { name: 'caustic blast', uses: null, atWill: true, constant: false },
    ],
  },
});
const castingActor = fakeCastingActor();
await attachSpellcasting(castingActor, preparedSpec, {
  findSpell: async (name) => ({
    _id: 'pack', name, type: 'spell',
    system: {
      slug: name.replace(/ /g, '-'),
      level: { value: name === 'caustic blast' ? 1 : 2 },
      traits: { value: name === 'caustic blast' ? ['cantrip'] : [] },
      location: { value: null },
    },
  }),
});
const slotUpdate = castingActor.updates[0]?.system?.slots ?? {};
const spellIds = castingActor.items.filter((i) => i.type === 'spell').map((i) => i._id);
check('the entry was updated with slots after the spells existed',
  castingActor.updates.length, 1);
check('every created spell is prepared into a slot',
  Object.values(slotUpdate).flatMap((s) => s.prepared.map((p) => p.id)).sort(),
  spellIds.sort());
check('no slot is left empty of the spell it counts',
  Object.values(slotUpdate).every((s) => s.prepared.length === s.max), true);

done('the builder path is rules-bound end to end');
