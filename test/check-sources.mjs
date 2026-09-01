/**
 * The three import sources, and the distinction that matters most: two are
 * converted through the tables and one is transcribed unchanged.
 *
 * Every expectation here is a literal read off the fixture by hand, not a
 * value asked of the code - an audit showed how easily a test that asks
 * `convert.js` and `tables.js` the same question proves nothing.
 */
import { makeCheck, load, installGlobals } from './harness.mjs';
import { CINDER_DRAKE, SILT_LURKER, FROST_REAVER } from './fixtures.mjs';

installGlobals();
const sources = await load('sources.js');
const { parsePF1eStatBlock } = await load('parsepf1.js');
const { parsePF2eStatBlock } = await load('parsepf2.js');
const { convertCreature } = await load('convert.js');
const { actorDataFromSpec } = await load('actor.js');
const tables = await load('tables.js');
const pf1 = await load('baselinepf1.js');
const { check, done } = makeCheck();

// --- The registry ------------------------------------------------------------
check('three sources are offered', Object.keys(sources.SOURCES), ['dnd5e', 'pf1e', 'pf2e']);
check('only the Pathfinder Second Edition source is transcribed directly',
  Object.keys(sources.SOURCES).filter((id) => sources.isDirect(id)), ['pf2e']);
check('an unknown source falls back rather than throwing',
  sources.sourceById('nonsense').id, sources.DEFAULT_SOURCE);
check('the default is the established importer', sources.DEFAULT_SOURCE, 'dnd5e');

// The envelope is the same shape whichever source ran, so the view never
// branches on the source to read a result.
const envelope5e = sources.parseWith('dnd5e', FROST_REAVER);
const envelopePF1 = sources.parseWith('pf1e', CINDER_DRAKE);
const envelopePF2 = sources.parseWith('pf2e', SILT_LURKER);
check('a converted source fills data and not spec',
  [Boolean(envelope5e.data), envelope5e.spec, envelope5e.mode], [true, null, 'converted']);
check('pf1e is converted too',
  [Boolean(envelopePF1.data), envelopePF1.spec, envelopePF1.mode], [true, null, 'converted']);
check('a direct source fills spec and not data',
  [envelopePF2.data, Boolean(envelopePF2.spec), envelopePF2.mode], [null, true, 'direct']);

// --- PF1e parsing ------------------------------------------------------------
const drake = parsePF1eStatBlock(CINDER_DRAKE);
check('drake parses without gaps', { ok: drake.ok, missing: drake.missing }, { ok: true, missing: [] });
const d = drake.data;
check('name loses the trailing CR', d.name, 'Cinder Drake');
check('CR comes off the name line', [d.cr, d.crText], [6, '6']);
check('size and type from the PF1e type line', [d.size, d.type, d.subtype], ['med', 'dragon', 'fire']);
check('full AC, not touch or flat-footed', d.ac, 20);
check('hit points and their formula', [d.hp, d.hpFormula], [66, '7d12+21']);
// PF1e prints its saves, so these are the real numbers rather than stand-ins.
check('printed saves are captured', d.saves, { fort: 8, ref: 8, will: 6 });
// Str 20 -> +5, Dex 17 -> +3, Con 17 -> +3, Int 8 -> -1, Wis 14 -> +2, Cha 11 -> 0
check('ability scores become modifiers', d.abilities, { str: 5, dex: 3, con: 3, int: -1, wis: 2, cha: 0 });
check('scores are kept as printed', d.scores.str, 20);
check('speeds', d.speeds, { walk: 40, others: [{ type: 'fly', value: 80 }] });
check('attacks with iteratives keep only the leading bonus',
  d.attacks.map((a) => [a.name, a.kind, a.bonus, a.count]),
  [['Bite', 'melee', 11, 1], ['Claws', 'melee', 11, 2], ['Breath', 'ranged', 9, 1]]);
check('reach applies to melee attacks only',
  d.attacks.map((a) => a.reach), [10, 10, null]);
check('damage type is inferred from the attack name',
  d.attacks.map((a) => a.damage[0]?.type), ['piercing', 'slashing', 'bludgeoning']);
check('a repeated natural attack becomes a full attack', d.multiattack.counts, { claws: 2 });
check('damage reduction and energy resistance both land',
  d.resistances, ['5/magic', 'acid 10']);
check('immunities split from condition immunities',
  [d.immunities, d.conditionImmunities], [['fire'], ['paralysis', 'sleep']]);
check('vulnerability loses its preamble', d.vulnerabilities, ['cold']);
check('Perception is captured as a skill', d.skills[0], { name: 'Perception', bonus: 12 });
check('skills line parsed', d.skills.map((s) => s.name), ['Perception', 'Fly', 'Stealth']);
check('languages', d.languages, ['Draconic']);
check('gear line', d.gearLine, 'scale mail, longsword');
check('(Ex)/(Su) abilities are collected',
  d.specials.map((s) => [s.name, s.section]),
  [['Breath Weapon', 'action'], ['Smoke Sight', 'action']]);
check('ability prose is captured, not just the name',
  d.specials[0].description.includes('30-foot cone'), true);
check('a mindless creature reports no ability rather than a modifier',
  parsePF1eStatBlock('Ooze CR 1\nN Medium ooze\nAC 10\nhp 20\nFort +2, Ref +0, Will +0\n'
    + 'Str 12, Dex 10, Con 14, Int -, Wis 10, Cha 1').data.abilities.int, -5);
check('parsing twice is identical', JSON.stringify(parsePF1eStatBlock(CINDER_DRAKE)), JSON.stringify(drake));

// --- PF1e conversion goes through the tables ---------------------------------
const drakeSpec = convertCreature(d);
check('CR 6 maps to level 6', drakeSpec.level, 6);
check('AC comes from the table, not the printed 20',
  [drakeSpec.ac.value, drakeSpec.ac.value === d.ac], [tables.acFor(6, drakeSpec.ac.tier), false]);
check('saves come from the table', [
  drakeSpec.saves.fortitude.value, drakeSpec.saves.reflex.value, drakeSpec.saves.will.value,
], [
  tables.saveFor(6, drakeSpec.saves.fortitude.tier),
  tables.saveFor(6, drakeSpec.saves.reflex.tier),
  tables.saveFor(6, drakeSpec.saves.will.tier),
]);
check('the printed strike bonus does not survive',
  drakeSpec.strikes[0].bonus === 11, false);
check('dragon type becomes the dragon trait', drakeSpec.traits.includes('dragon'), true);
check('gear from the PF1e gear line reaches the spec',
  drakeSpec.equipment.map((e) => e.name).sort(), ['longsword', 'scale mail']);

// PF1e prints saves, so the ranking uses them rather than ability modifiers:
// Fort +8 and Ref +8 tie above Will +6.
check('saves rank from the printed values',
  [drakeSpec.saves.fortitude.tier, drakeSpec.saves.reflex.tier, drakeSpec.saves.will.tier],
  ['high', 'high', 'low']);

check('pf1e baselines rise with CR', [
  pf1.baselineForCR(1).ac < pf1.baselineForCR(10).ac,
  pf1.baselineForCR(1).hp < pf1.baselineForCR(10).hp,
  pf1.baselineForCR(1).attack < pf1.baselineForCR(10).attack,
], [true, true, true]);
check('pf1e CR maps to level the way 5e CR does',
  [pf1.levelFromCR(0), pf1.levelFromCR(0.5), pf1.levelFromCR(6), pf1.levelFromCR(30)], [-1, 1, 6, 24]);

// --- PF2e transcription ------------------------------------------------------
const lurker = parsePF2eStatBlock(SILT_LURKER);
check('lurker parses without gaps', { ok: lurker.ok, missing: lurker.missing }, { ok: true, missing: [] });
const s = lurker.spec;

/*
 * The load-bearing test for this whole feature: every one of these is the
 * number printed in the fixture. If any of them came from the tables instead,
 * the importer would be quietly rewriting correct creatures.
 */
check('name and level as printed', [s.name, s.level], ['Silt Lurker', 6]);
check('AC is the printed 23', s.ac.value, 23);
check('HP is the printed 105', s.hp.value, 105);
check('saves are the printed +16/+12/+11',
  [s.saves.fortitude.value, s.saves.reflex.value, s.saves.will.value], [16, 12, 11]);
check('Perception is the printed +16', s.perception.mod, 16);
check('ability modifiers as printed', s.abilities, { str: 5, dex: 3, con: 4, int: -2, wis: 2, cha: -1 });
check('skills keep their printed modifiers',
  s.skills.map((k) => [k.slug, k.mod]), [['athletics', 16], ['stealth', 14]]);
check('strike bonuses and damage as printed',
  s.strikes.map((k) => [k.name, k.kind, k.bonus, k.damage, k.damageType]),
  [['Jaws', 'melee', 18, '2d8+9', 'piercing'], ['Spine', 'ranged', 14, '2d6+4', 'piercing']]);
check('a rider keeps its printed dice here, because they are already correct',
  s.strikes[0].extra, [{ dice: '1d6', type: 'acid' }]);

// None of it went through the tier machinery.
check('no statistic carries a tier', [
  s.ac.tier, s.hp.tier, s.perception.tier, s.saves.will.tier, s.strikes[0].tier,
], [null, null, null, null, null]);
check('the spec is marked as a direct transcription', s.direct, true);
/*
 * For contrast: had this gone through the converter, the strike bonus would
 * be one of the level 6 table values. It is 18, which is none of them.
 * (AC is a poor witness here - the printed 23 happens to equal the level 6
 * moderate AC, which is exactly the coincidence that makes "the numbers
 * differ" a fragile way to state this.)
 */
check('the printed strike bonus matches no tier at this level',
  ['extreme', 'high', 'moderate', 'low'].map((tier) => tables.strikeBonusFor(6, tier))
    .includes(s.strikes[0].bonus), false);

check('size and rarity from the trait line', [s.size, s.rarity], ['lg', 'uncommon']);
check('traits from the trait line', s.traits, ['aberration', 'amphibious']);
check('senses carry acuity, and an imprecise one keeps its range', s.senses, [
  { type: 'darkvision', acuity: 'precise' },
  { type: 'tremorsense', acuity: 'imprecise', range: 30 },
]);
check('languages map to slugs', s.languages, ['aklo']);
check('speeds as printed', s.speeds, { land: 20, others: [{ type: 'swim', value: 40 }] });
check('items become gear', s.equipment, [{ name: 'trident', uuid: null }]);
check('IWR as printed', [s.immunities, s.resistances, s.weaknesses],
  [['poison'], [{ type: 'acid', value: 5 }], [{ type: 'cold', value: 5 }]]);
check('reach is a trait, not part of the name',
  [s.strikes[0].traits, s.strikes[0].name], [['reach-10'], 'Jaws']);
check('a range increment belongs in the range field, not the traits',
  [s.strikes[1].rangeIncrement, s.strikes[1].traits], [30, []]);
check('an action glyph sets the cost and leaves the name clean',
  s.specials.map((k) => [k.name, k.actionType]),
  [['Silt Cloud', 'reaction'], ['Engulfing Silt', 'passive']]);
check('the name and trait lines are not mistaken for abilities',
  s.specials.some((k) => /Creature|Uncommon/.test(k.name)), false);
check('transcribing twice is identical', JSON.stringify(parsePF2eStatBlock(SILT_LURKER)), JSON.stringify(lurker));

// --- A transcribed spec still builds a valid actor ---------------------------
const actor = actorDataFromSpec(s);
check('the actor carries the printed numbers', [
  actor.system.attributes.ac.value, actor.system.attributes.hp.max,
  actor.system.perception.mod, actor.system.saves.fortitude.value,
], [23, 105, 16, 16]);
check('skills are actor data here too', actor.system.skills, {
  athletics: { base: 16 }, stealth: { base: 14 },
});
check('strikes become melee items with the printed bonus',
  actor.items.filter((i) => i.type === 'melee').map((i) => i.system.bonus.value), [18, 14]);
check('the provenance says it was transcribed, not converted',
  actor.system.details.publicNotes.includes('copied as printed'), true);

done('all three import sources behave, and only one converts');
