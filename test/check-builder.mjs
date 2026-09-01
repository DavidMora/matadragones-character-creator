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

check('band is measured, not asserted', rules.publishedBand().max >= 4, true);

const overtuned = {
  level: 5, perception: 'extreme', ac: 'extreme', fortitude: 'extreme', reflex: 'high',
  will: 'high', hp: 'high', attack: 'extreme', damage: 'extreme', spell: 'extreme',
  abilities: { str: 'extreme', dex: 'high', con: 'high', int: 'moderate', wis: 'moderate', cha: 'high' },
};
const verdict = rules.validateDraft(overtuned);
check('too many extremes is an error', verdict.errors.some((e) => e.key === 'extremes'), true);
check('over-budget warns', verdict.warnings.some((w) => w.key === 'budget'), true);
check('a creature with no weakness warns', verdict.warnings.some((w) => w.key === 'nogaps'), true);

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

const draft = { drops: { spells: [], specials: [], gear: [], strikes: [] } };
check('a drop is added', drops.addDrop(draft, drops.describeDropped(spellItem)), true);
check('the same item twice is refused', drops.addDrop(draft, drops.describeDropped(spellItem)), false);
check('one entry stored', draft.drops.spells.length, 1);

// --- Dropped items reach the spec --------------------------------------------
const built = {
  ...seedFromRoadMap('spellcaster', 6),
  name: 'Dropper', size: 'med', rarity: 'common', traits: [], speed: 25,
  description: '', gear: 'longsword', tradition: 'occult', senses: [], languages: ['Common'],
  strikes: [{ name: 'Staff', kind: 'melee', damageType: 'bludgeoning' }], skills: [],
  drops: {
    spells: [drops.describeDropped(spellItem)],
    specials: [special],
    gear: [drops.describeDropped({ type: 'weapon', uuid: 'Compendium.x.Item.axe', name: 'Battle Axe', system: {} })],
    strikes: [],
  },
};
const spec = specFromBuilder(built);
check('dropped spell lands in the entry with its uuid',
  spec.spellcasting.entries[0].spells, [{ name: 'fireball', uuid: 'Compendium.pf2e.spells-srd.Item.abc', uses: null, atWill: false, constant: false }]);
check('entry uses the chosen tradition and table DC',
  [spec.spellcasting.entries[0].tradition, spec.spellcasting.entries[0].dc],
  ['occult', tables.spellDCFor(6, 'high')]);
check('dropped ability lands in specials with its uuid',
  spec.specials.map((s) => [s.name, s.uuid]), [['Grab', 'Compendium.pf2e.actionspf2e.Item.def']]);
check('typed and dropped gear both land',
  spec.equipment, [
    { name: 'longsword', uuid: null },
    { name: 'staff', uuid: null },
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
check('concept spells are remastered and given frequencies', conceptDraft.conceptSpells, [
  { name: 'summon undead', uses: 2, atWill: false, constant: false },
  { name: 'void warp', uses: null, atWill: true, constant: false },
]);

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
const { slotsForSources } = await load('spells.js');
check('slots counted per rank', slotsForSources([
  { system: { level: { value: 1 }, traits: { value: ['cantrip'] } } },
  { system: { level: { value: 3 }, traits: { value: [] } } },
  { system: { level: { value: 3 }, traits: { value: [] } } },
]), {
  slot0: { value: 1, max: 1, prepared: [] },
  slot3: { value: 2, max: 2, prepared: [] },
});

done('the builder path is rules-bound end to end');
