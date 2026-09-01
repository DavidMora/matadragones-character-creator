/** The deterministic stat block parser, against both layouts. */
import { makeCheck, load } from './harness.mjs';
import { FROST_REAVER, EMBER_WISP, GLOOM_CALLER } from './fixtures.mjs';

const { parse5eStatBlock, damagePerRound, diceAverage } = await load('parse5e.js');
const { check, done } = makeCheck();

// --- 2014 layout -------------------------------------------------------------
const reaver = parse5eStatBlock(FROST_REAVER);
check('reaver parses without gaps', { ok: reaver.ok, missing: reaver.missing }, { ok: true, missing: [] });
const r = reaver.data;
check('reaver name', r.name, 'Frost Reaver');
check('reaver size and type', [r.size, r.type], ['lg', 'monstrosity']);
check('reaver AC and note', [r.ac, r.acNote], [16, 'natural armor']);
check('reaver HP and formula', [r.hp, r.hpFormula], [136, '13d10 + 65']);
check('reaver speeds', r.speeds, { walk: 40, others: [{ type: 'climb', value: 30 }] });
check('reaver abilities', r.abilities, { str: 5, dex: 1, con: 5, int: -2, wis: 2, cha: 0 });
check('reaver saves', r.saves, { con: 9, wis: 6 });
check('reaver skills', r.skills, [{ name: 'Perception', bonus: 6 }, { name: 'Stealth', bonus: 5 }]);
check('reaver resistances keep the compound clause', r.resistances.length >= 2, true);
check('reaver immunities', r.immunities, ['poison']);
check('reaver condition immunities', r.conditionImmunities, ['poisoned', 'frightened']);
check('reaver senses', r.senses, [{ type: 'darkvision', range: 60 }]);
check('reaver passive perception', r.passivePerception, 16);
check('reaver languages', r.languages, ['Giant']);
check('reaver CR', r.cr, 9);
check('reaver proficiency derived from CR', r.prof, 4);

check('reaver specials found', r.specials.map((s) => s.name), [
  'Rime Body', 'Keen Smell', 'Multiattack', 'Bite', 'Claw', 'Frozen Breath (Recharge 5-6)', 'Ice Shield',
]);
check('reaver sections assigned', r.specials.map((s) => s.section), [
  'trait', 'trait', 'action', 'action', 'action', 'action', 'reaction',
]);

check('reaver attacks', r.attacks.map((a) => [a.name, a.kind, a.bonus, a.reach]), [
  ['Bite', 'melee', 9, 5],
  ['Claw', 'melee', 9, 10],
]);
check('reaver bite damage instances', r.attacks[0].damage, [
  { dice: '2d10+5', average: 16, type: 'piercing' },
  { dice: '2d6', average: 7, type: 'cold' },
]);
check('reaver multiattack counts', r.multiattack.counts, { claw: 2, bite: 1 });
// Two claws (12) + one bite (16 + 7) = 47.
check('reaver damage per round honours multiattack', damagePerRound(r), 47);

// --- 2024 layout -------------------------------------------------------------
const wisp = parse5eStatBlock(EMBER_WISP);
check('wisp parses without gaps', { ok: wisp.ok, missing: wisp.missing }, { ok: true, missing: [] });
const w = wisp.data;
check('wisp size and type', [w.size, w.type], ['sm', 'elemental']);
check('wisp AC/HP', [w.ac, w.hp], [14, 44]);
check('wisp fly speed', w.speeds.others, [{ type: 'fly', value: 50 }]);
check('wisp abilities from tri-column', w.abilities, { str: -2, dex: 3, con: 2, int: -1, wis: 1, cha: 1 });
check('wisp saves from tri-column', w.saves.dex, 5);
check('wisp merged immunities split', {
  damage: w.immunities, condition: w.conditionImmunities,
}, { damage: ['fire', 'poison'], condition: ['poisoned', 'prone'] });
check('wisp vulnerabilities', w.vulnerabilities, ['cold']);
check('wisp CR', w.cr, 2);
check('wisp attacks', w.attacks.map((a) => [a.name, a.kind, a.bonus]), [
  ['Singe', 'melee', 5],
  ['Cinder Bolt', 'ranged', 5],
]);
check('wisp ranged range', w.attacks[1].range, { increment: 60, max: null });
check('wisp flat multiattack', w.multiattack.counts, { '*': 2 });
// Best attack's printed average (7) twice.
check('wisp DPR is best attack twice', damagePerRound(w), 14);

// --- Spell lists -------------------------------------------------------------
const caller = parse5eStatBlock(GLOOM_CALLER);
check('caller parses without gaps', { ok: caller.ok, missing: caller.missing }, { ok: true, missing: [] });
const c = caller.data;
check('caller casting ability is the first printed', c.spellcasting.ability, 'cha');
check('caller spell groups', c.spellcasting.groups.map((g) => [g.kind, g.uses ?? g.slots ?? null, g.spells]), [
  ['at-will', null, ['mage hand', 'misty step']],
  ['per-day', 3, ['dimension door', 'hold person']],
  ['per-day', 1, ['phantasmal killer']],
  ['cantrips', null, ['acid splash', 'mage hand']],
  ['slots', 4, ['magic missile', 'mage armor']],
  ['slots', 3, ['scorching ray']],
  ['slots', 2, ['fireball']],
]);
check('caller slot ranks', c.spellcasting.groups.filter((g) => g.kind === 'slots').map((g) => g.rank5e), [1, 2, 3]);
check('spell attack action still extracted', c.attacks.map((a) => a.name), ['Shadow Claw']);
check('no spellcasting on the spell-less reaver', r.spellcasting, null);

// --- Odds and ends -----------------------------------------------------------
check('diceAverage handles flat and dice', [diceAverage('2d8+6'), diceAverage('7')], [15, 7]);
check('empty input refuses politely', parse5eStatBlock('').ok, false);
const junk = parse5eStatBlock('Just a name\nand some prose that is not a stat block.');
check('junk reports what is missing', junk.missing.length >= 3, true);
check('parsing twice is identical', JSON.stringify(parse5eStatBlock(FROST_REAVER)), JSON.stringify(reaver));

done('stat block parser handles both layouts');
