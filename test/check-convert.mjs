/**
 * The deterministic conversion: classification thresholds, level mapping,
 * text substitution, and the promise that no printed number reaches the spec.
 */
import { makeCheck, load, installGlobals } from './harness.mjs';
import { FROST_REAVER, EMBER_WISP } from './fixtures.mjs';

installGlobals();
const { parse5eStatBlock } = await load('parse5e.js');
const convert = await load('convert.js');
const tables = await load('tables.js');
const { levelFromCR, baselineForCR, parseCR, proficiencyForCR } = await load('baseline5e.js');
const { check, done } = makeCheck();

// --- CR plumbing -------------------------------------------------------------
check('parseCR fractions and wholes', [parseCR('1/4'), parseCR('13 (10,000 XP)'), parseCR('junk')], [0.25, 13, null]);
check('proficiency progression', [proficiencyForCR(1), proficiencyForCR(4), proficiencyForCR(5), proficiencyForCR(13), proficiencyForCR(28)], [2, 2, 3, 5, 8]);
check('level mapping compresses fractions', [levelFromCR(0), levelFromCR(0.125), levelFromCR(0.5), levelFromCR(9), levelFromCR(30)], [-1, 0, 1, 9, 24]);
check('baseline widths are sane', baselineForCR(9).dmgMax > baselineForCR(9).dmgMin, true);

// --- Classification on the fixtures -----------------------------------------
const reaver = parse5eStatBlock(FROST_REAVER).data;
const tiers = convert.classify(reaver);
// AC 16 vs expected 16 at CR 9 -> moderate; HP 136 vs ~154 -> moderate;
// attack +9 vs expected +8 -> high; saves rank Con > Wis > Dex.
check('reaver AC classified moderate', tiers.ac, 'moderate');
check('reaver HP classified moderate', tiers.hp, 'moderate');
check('reaver attack classified high', tiers.attack, 'high');
check('reaver saves ranked', [tiers.fortitude, tiers.will, tiers.reflex], ['high', 'moderate', 'low']);
check('reaver perception high from proficiency', tiers.perception, 'high');
check('reaver spell tier from ability DCs only', tiers.spell, 'moderate');

// --- Classification boundaries ----------------------------------------------
/*
 * The fixtures all sit comfortably inside every band, so every threshold in
 * classify() could be moved without a single test failing. These probe the
 * edges directly: a creature built to land one point either side of each
 * boundary. A moved threshold is not a rounding difference - it decides
 * whether an imported boss is a boss.
 */
const atCR = (cr, overrides = {}) => ({
  cr, ac: 0, hp: 0, abilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  saves: {}, skills: [], specials: [], attacks: [], multiattack: null, speeds: { walk: 25, others: [] },
  ...overrides,
});
const base9 = baselineForCR(9);

check('AC boundaries: +4 extreme, +2 high, -1 moderate, -2 low', [
  convert.classify(atCR(9, { ac: base9.ac + 4 })).ac,
  convert.classify(atCR(9, { ac: base9.ac + 3 })).ac,
  convert.classify(atCR(9, { ac: base9.ac + 2 })).ac,
  convert.classify(atCR(9, { ac: base9.ac + 1 })).ac,
  convert.classify(atCR(9, { ac: base9.ac - 1 })).ac,
  convert.classify(atCR(9, { ac: base9.ac - 2 })).ac,
], ['extreme', 'high', 'high', 'moderate', 'moderate', 'low']);

check('HP boundaries: 1.3x high, 0.75x moderate, below that low', [
  convert.classify(atCR(9, { hp: Math.ceil(base9.hp * 1.3) })).hp,
  convert.classify(atCR(9, { hp: Math.floor(base9.hp * 1.29) })).hp,
  convert.classify(atCR(9, { hp: Math.ceil(base9.hp * 0.75) })).hp,
  convert.classify(atCR(9, { hp: Math.floor(base9.hp * 0.74) })).hp,
], ['high', 'moderate', 'moderate', 'low']);

const withAttack = (bonus) => atCR(9, {
  attacks: [{ name: 'Bite', kind: 'melee', bonus, reach: 5, damage: [], text: '' }],
});
check('attack boundaries: +5 extreme, +1 high, -2 moderate, below low', [
  convert.classify(withAttack(base9.attack + 5)).attack,
  convert.classify(withAttack(base9.attack + 4)).attack,
  convert.classify(withAttack(base9.attack + 1)).attack,
  convert.classify(withAttack(base9.attack)).attack,
  convert.classify(withAttack(base9.attack - 2)).attack,
  convert.classify(withAttack(base9.attack - 3)).attack,
], ['extreme', 'high', 'high', 'moderate', 'moderate', 'low']);

const withDamage = (average) => atCR(9, {
  attacks: [{ name: 'Bite', kind: 'melee', bonus: 0, reach: 5, text: '',
    damage: [{ dice: '1d4', average, type: 'piercing' }] }],
});
// Straddling values rather than the exact thresholds: the fractions are
// computed in floating point, so `dmgMin + span * 1.1` lands a hair under
// 1.1 and would make the test about arithmetic rather than about the bands.
const span = base9.dmgMax - base9.dmgMin;
const atFraction = (f) => convert.classify(withDamage(base9.dmgMin + span * f)).damage;
check('damage bands scale off the CR range', [
  atFraction(1.2), atFraction(1.0), atFraction(0.7), atFraction(0.5), atFraction(0.2), atFraction(0.05),
], ['extreme', 'high', 'high', 'moderate', 'moderate', 'low']);

check('perception: the printed skill earns high, Wisdom decides the rest', [
  convert.classify(atCR(9, { skills: [{ name: 'Perception', bonus: 5 }] })).perception,
  convert.classify(atCR(9, { abilities: { wis: 0 } })).perception,
  convert.classify(atCR(9, { abilities: { wis: -1 } })).perception,
], ['high', 'moderate', 'low']);

// --- Full conversion ---------------------------------------------------------
const spec = convert.convertCreature(reaver);
check('reaver converts at level 9', spec.level, 9);
check('reaver AC from table', spec.ac.value, tables.acFor(9, 'moderate'));
check('reaver fort from table', spec.saves.fortitude.value, tables.saveFor(9, 'high'));
// Perception had no assertion at all: the imported passive Perception could
// be piped straight onto the sheet and every suite stayed green.
check('reaver perception from table', spec.perception.mod, tables.perceptionFor(9, 'high'));
check('perception is not the imported passive value',
  spec.perception.mod === (reaver.passivePerception - 10), false);
// HP had only relative assertions, so the whole interpolation could drift.
/*
 * Hand-derived, so it does not ask the code what the code thinks: the reaver
 * prints 136 HP against a CR 9 expectation of 154, a ratio of 0.883; the
 * conversion maps that through /1.6 to 0.552 of the level 9 span, which runs
 * 112 (low minimum) to 198 (high maximum). 112 + 0.552 * 86 = 159.
 */
check('reaver HP is the interpolated value, not a copied one', spec.hp.value, 159);
check('and is not the printed 136', spec.hp.value === reaver.hp, false);
check('HP sits inside the level span', [
  spec.hp.value >= tables.hpSpan(9).min, spec.hp.value <= tables.hpSpan(9).max,
], [true, true]);
check('imported ability modifiers are clamped to the published ceiling',
  convert.convertCreature({ ...reaver, abilities: { ...reaver.abilities, str: 99 } }).abilities.str,
  tables.abilityFor(9, 'extreme'));
check('reaver strikes keep identity', spec.strikes.map((s) => [s.name, s.kind, s.damageType]), [
  ['Bite', 'melee', 'piercing'],
  ['Claw', 'melee', 'slashing'],
]);
check('primary strike uses classified damage tier dice', spec.strikes[0].damage, tables.strikeDamageFor(9, tiers.damage).dice);
check('secondary strike sits one tier lower', spec.strikes[1].damage,
  tables.strikeDamageFor(9, { extreme: 'high', high: 'moderate', moderate: 'low', low: 'low' }[tiers.damage]).dice);
// Body-part strikes are unarmed; only longer-than-normal reach adds a trait.
check('a claw is unarmed and keeps its reach', spec.strikes[1].traits, ['unarmed', 'reach-10']);
// The rider keeps its type but not its printed dice - that was the last
// imported number reaching the sheet.
check('cold rider keeps its type, takes its dice from the level',
  spec.strikes[0].extra, [{ dice: convert.riderDice(9), type: 'cold' }]);
check('the printed rider dice do not survive',
  spec.strikes[0].extra[0].dice === '2d6' && reaver.attacks[0].damage[1].dice === '2d6', false);
check('rider dice scale with level',
  [convert.riderDice(1), convert.riderDice(5), convert.riderDice(10), convert.riderDice(20)],
  ['1d6', '2d6', '3d6', '5d6']);
check('strike bonus comes from the table', spec.strikes[0].bonus, tables.strikeBonusFor(9, 'high'));

check('monstrosity becomes beast trait', spec.traits, ['beast']);
check('resistances mapped with table value', spec.resistances.map((r) => r.type).sort(),
  ['bludgeoning', 'cold', 'piercing', 'slashing']);
check('resistance value from table', spec.resistances[0].value, tables.resistanceFor(9));
check('condition immunities mapped to pf2e slugs',
  spec.immunities.includes('fear-effects') && spec.immunities.includes('poison'), true);
check('darkvision mapped and Keen Smell translated to scent', spec.senses, [
  { type: 'darkvision', acuity: 'precise', range: 60 },
  { type: 'scent', acuity: 'imprecise', range: 30 },
]);
check('perception skill folded out, stealth kept, athletics added',
  spec.skills.map((s) => s.slug).sort(), ['athletics', 'stealth']);
check('Giant maps to jotun', spec.languages, ['jotun']);
check('duplicate immunity slugs collapse to one', spec.immunities, ['poison', 'fear-effects']);

// --- Languages ---------------------------------------------------------------
check('remaster language renames', convert.mapLanguages(['Abyssal', 'Celestial', 'Infernal', 'Undercommon', 'Deep Speech']),
  { value: ['chthonian', 'empyrean', 'diabolic', 'sakvroth', 'aklo'], details: '' });
check('primordial fans out to the elemental tongues',
  convert.mapLanguages(['Primordial']).value, ['petran', 'pyric', 'sussuran', 'thalassic']);
check('unmappable entries survive as details, never dropped',
  convert.mapLanguages(['Common', 'telepathy 120 ft', "understands Sylvan but can't speak"]),
  { value: ['common'], details: "telepathy 120 ft; understands Sylvan but can't speak" });
check('language slugs deduped', convert.mapLanguages(['Elvish', 'Elven']).value, ['elven']);

// The printed DC 17 must not survive; the level's DC must appear instead.
const breath = spec.specials.find((s) => s.name === 'Frozen Breath');
const expectedDC = tables.spellDCFor(9, 'moderate');
check('ability DC recomputed', breath.description.includes(`DC ${expectedDC} Fortitude save`), true);
check('printed DC gone', breath.description.includes('DC 17'), false);
check('saving throw phrasing converted', /saving throw/.test(breath.description), false);
check('multiattack dropped, attacks and translated traits not duplicated',
  spec.specials.map((s) => s.name), ['Rime Body', 'Frozen Breath', 'Ice Shield']);
check('reaction typed', spec.specials.find((s) => s.name === 'Ice Shield').actionType, 'reaction');

// Determinism: same text in, same creature out. Re-parsed each time and
// repeated, because two samples catch a coin-flip only half the time.
const runs = Array.from({ length: 8 }, () => JSON.stringify(
  convert.convertCreature(parse5eStatBlock(FROST_REAVER).data),
));
check('conversion is deterministic across repeated parses',
  new Set(runs).size, 1);
check('and matches the first conversion', runs[0], JSON.stringify(spec));

// GM overrides win and are reflected, level rides along.
const tuned = convert.convertCreature(reaver, { level: 12, tiers: { ac: 'extreme', hp: 'high' } });
check('level override honoured', tuned.level, 12);
check('AC override read from table at new level', tuned.ac.value, tables.acFor(12, 'extreme'));
check('HP override uses the tier band', tuned.hp.value > spec.hp.value, true);

// --- The wisp exercises ranged + vulnerabilities -----------------------------
const wisp = parse5eStatBlock(EMBER_WISP).data;
const wispSpec = convert.convertCreature(wisp);
check('wisp level from CR 2', wispSpec.level, 2);
check('wisp ranged strike keeps range', wispSpec.strikes[1].rangeIncrement, 60);
check('wisp weakness from vulnerability', wispSpec.weaknesses, [{ type: 'cold', value: tables.resistanceFor(2) }]);
check('wisp fly speed carried', wispSpec.speeds.others, [{ type: 'fly', value: 50 }]);
/*
 * Every vocabulary entry, not just the ones a fixture happens to touch: an
 * audit scrambled psychic->sonic, investigation->occultism and
 * restrained->grabbed and nothing failed. These maps are the module's
 * translation dictionary; a wrong entry is a wrong creature, silently.
 */
check('every 5e damage type maps to its pf2e counterpart', convert.DAMAGE_TYPE_MAP, {
  acid: 'acid', bludgeoning: 'bludgeoning', cold: 'cold', fire: 'fire', force: 'force',
  lightning: 'electricity', necrotic: 'void', piercing: 'piercing', poison: 'poison',
  psychic: 'mental', radiant: 'vitality', slashing: 'slashing', thunder: 'sonic',
});
check('every 5e skill maps to its pf2e counterpart', convert.SKILL_MAP, {
  acrobatics: 'acrobatics', arcana: 'arcana', athletics: 'athletics', deception: 'deception',
  history: 'society', intimidation: 'intimidation', investigation: 'society', medicine: 'medicine',
  nature: 'nature', performance: 'performance', persuasion: 'diplomacy', religion: 'religion',
  'sleight of hand': 'thievery', stealth: 'stealth', survival: 'survival',
});
check('every 5e condition maps to its pf2e immunity slug', convert.CONDITION_MAP, {
  blinded: 'blinded', charmed: 'controlled', deafened: 'deafened', exhaustion: 'fatigued',
  frightened: 'fear-effects', grappled: 'grabbed', paralyzed: 'paralyzed', petrified: 'petrified',
  poisoned: 'poison', prone: 'prone', restrained: 'immobilized', stunned: 'stunned',
  unconscious: 'unconscious',
});
check('creature types map to pf2e traits', convert.CREATURE_TYPE_MAP, {
  aberration: 'aberration', beast: 'animal', celestial: 'celestial', construct: 'construct',
  dragon: 'dragon', elemental: 'elemental', fey: 'fey', fiend: 'fiend', giant: 'giant',
  humanoid: 'humanoid', monstrosity: 'beast', ooze: 'ooze', plant: 'plant', undead: 'undead',
});
check('each ability saves with the right defence', [
  convert.convertAbilityText('DC 1 Strength saving throw', { level: 5, spellTier: 'moderate' }),
  convert.convertAbilityText('DC 1 Constitution saving throw', { level: 5, spellTier: 'moderate' }),
  convert.convertAbilityText('DC 1 Dexterity saving throw', { level: 5, spellTier: 'moderate' }),
  convert.convertAbilityText('DC 1 Intelligence saving throw', { level: 5, spellTier: 'moderate' }),
  convert.convertAbilityText('DC 1 Charisma saving throw', { level: 5, spellTier: 'moderate' }),
].map((s) => s.split(' ').pop()), ['save', 'save', 'save', 'save', 'save'].map(() => 'save'));
check('str and con guard Fortitude, dex Reflex, int/wis/cha Will', [
  convert.convertAbilityText('DC 1 Strength saving throw', { level: 5 }).includes('Fortitude'),
  convert.convertAbilityText('DC 1 Constitution saving throw', { level: 5 }).includes('Fortitude'),
  convert.convertAbilityText('DC 1 Dexterity saving throw', { level: 5 }).includes('Reflex'),
  convert.convertAbilityText('DC 1 Intelligence saving throw', { level: 5 }).includes('Will'),
  convert.convertAbilityText('DC 1 Charisma saving throw', { level: 5 }).includes('Will'),
], [true, true, true, true, true]);

// A melee strike at 5 feet must NOT gain a reach trait; only longer ones do.
check('only longer-than-normal reach becomes a trait',
  [spec.strikes[0].traits, spec.strikes[1].traits], [['unarmed'], ['unarmed', 'reach-10']]);
check('a weapon strike is not unarmed', convert.convertCreature({
  ...reaver,
  attacks: [{ name: 'Longsword', kind: 'melee', bonus: 9, reach: 5, damage: [{ dice: '1d8', average: 5, type: 'slashing' }], text: '' }],
}).strikes[0].traits, []);
check('an odd reach snaps to the published vocabulary', convert.convertCreature({
  ...reaver,
  attacks: [{ name: 'Tentacle', kind: 'melee', bonus: 9, reach: 12, damage: [{ dice: '1d8', average: 5, type: 'bludgeoning' }], text: '' }],
}).strikes[0].traits, ['unarmed', 'reach-10']);

// The secondary-strike step-down, asserted against the published order
// rather than a copy of the mapping reimplemented in the test.
check('a secondary strike steps down exactly one tier', [
  convert.LOWER_TIER.extreme, convert.LOWER_TIER.high,
  convert.LOWER_TIER.moderate, convert.LOWER_TIER.low,
], ['high', 'moderate', 'low', 'low']);

// --- convertAbilityText in isolation ----------------------------------------
const rewritten = convert.convertAbilityText(
  'Must succeed on a DC 15 Dexterity saving throw or take 21 (6d6) fire damage. A DC 13 Wisdom saving throw ends it.',
  { level: 5, spellTier: 'moderate' },
);
const dc5 = tables.spellDCFor(5, 'moderate');
check('all DCs rewritten to the level DC', (rewritten.match(new RegExp(`DC ${dc5}`, 'g')) ?? []).length, 2);
check('dex becomes Reflex', rewritten.includes('Reflex save'), true);
check('wis becomes Will', rewritten.includes('Will save'), true);
// An orphan DC with no named save ("escape DC 14") must be recomputed too.
const orphan = convert.convertAbilityText('The target is grabbed (escape DC 14).', { level: 5, spellTier: 'moderate' });
check('orphan DCs recomputed', orphan, `The target is grabbed (escape DC ${dc5}).`);

// --- Remaster spell naming ---------------------------------------------------
const { modernizeSpellNames, SPELL_RENAMES } = await load('spellnames.js');
check('legacy names renamed, capital preserved',
  modernizeSpellNames('It casts Magic Missile and mage armor at will.'),
  'It casts Force barrage and mystic armor at will.');
check('word boundaries respected',
  modernizeSpellNames('The mage handles the blinking lights.'),
  'The mage handles the blinking lights.');
check('whole names match, not fragments',
  modernizeSpellNames('casts commune with nature and vampiric touch'),
  'casts commune and vampiric feast');
check('renaming is idempotent: no remaster name is itself renamed',
  Object.values(SPELL_RENAMES).some((name) => name in SPELL_RENAMES), false);

const spellTrait = convert.convertAbilityText(
  'Spellcasting. Its spellcasting ability is Charisma (spell save DC 15, +7 to hit with spell attacks). '
  + 'At will: mage hand, misty step. 3/day: dimension door, hold person.',
  { level: 9, spellTier: 'high' },
);
const dc9 = tables.spellDCFor(9, 'high');
check('spellcasting trait fully remastered', spellTrait,
  `Spellcasting. Its spellcasting ability is Charisma (spell DC ${dc9}, spell attack +${dc9 - 8}). `
  + 'At will: telekinetic hand, translocate. 3/day: translocate, paralyze.');

// --- Spellcasting entries ----------------------------------------------------
const { GLOOM_CALLER } = await import('./fixtures.mjs');
const callerSpec = convert.convertCreature(parse5eStatBlock(GLOOM_CALLER).data);

check('slot caster classified high', callerSpec.spell.tier, 'high');
check('two entries: innate and spontaneous',
  callerSpec.spellcasting.entries.map((e) => [e.name, e.category]),
  [['Innate Spellcasting', 'innate'], ['Spellcasting', 'spontaneous']]);
check('fiend casts divine regardless of ability',
  callerSpec.spellcasting.entries.map((e) => e.tradition), ['divine', 'divine']);
check('entry DC and attack from the tables', [
  callerSpec.spellcasting.entries[0].dc, callerSpec.spellcasting.entries[0].attack,
], [tables.spellDCFor(7, 'high'), tables.spellAttackFor(7, 'high')]);

const innateSpells = callerSpec.spellcasting.entries[0].spells;
check('innate spells remastered with frequencies',
  innateSpells.map((s) => [s.name, s.uses, s.atWill]), [
    ['telekinetic hand', null, true],
    ['translocate', null, true],
    ['paralyze', 3, false],
    // Still a real spell in the compendium, so its name survives untouched.
    ['phantasmal killer', 1, false],
  ]);
// "dimension door" (3/day) and "misty step" (at will) both remaster to
// translocate; at-will is collected first, so the better frequency wins.
check('duplicate remaster names deduped in at-will\'s favour',
  innateSpells.filter((s) => s.name === 'translocate').length, 1);

const casterEntry = callerSpec.spellcasting.entries[1];
check('cantrips filed with the slot caster, deduped against nothing',
  casterEntry.spells.map((s) => s.name),
  ['acid splash', 'telekinetic hand', 'force barrage', 'mystic armor', 'blazing bolt', 'fireball']);
check('slots copied per rank', casterEntry.slots, { 1: 4, 2: 3, 3: 2 });

check('spellcasting traits do not duplicate as prose specials',
  callerSpec.specials.some((s) => /spellcasting/i.test(s.name)), false);
// Printed Arcana and Deception survive; Intimidation follows Cha +4 and
// Religion follows the divine tradition; Dex +2 earns nothing.
check('derived skills follow the concept', callerSpec.skills.map((s) => s.slug).sort(),
  ['arcana', 'deception', 'intimidation', 'religion']);
check('derived skills stay moderate',
  callerSpec.skills.filter((s) => ['intimidation', 'religion'].includes(s.slug)).every((s) => s.tier === 'moderate'), true);
check('caller languages mapped', callerSpec.languages, ['chthonian', 'common']);
check('grappled prose becomes a Grab attack effect',
  callerSpec.strikes[0].attackEffects, ['grab']);

// --- Source-game-exclusive mechanics -----------------------------------------
const { ELDER_WYRM } = await import('./fixtures.mjs');
const wyrm = convert.convertCreature(parse5eStatBlock(ELDER_WYRM).data);
const byName = (name) => wyrm.specials.find((s) => s.name === name);

check('wyrm converts at level 13', wyrm.level, 13);
check('legendary resistance becomes a 3/day free action', [
  byName('Legendary Resistance').actionType,
  byName('Legendary Resistance').frequency,
], ['free', { max: 3, per: 'day' }]);
check('legendary resistance text is pf2e idiom',
  byName('Legendary Resistance').description.includes('succeeds at the saving throw instead'), true);
check('magic resistance becomes a status bonus',
  byName('Magic Resistance').description, 'The creature has a +1 status bonus to all saving throws against magical effects.');
check('keen smell becomes an imprecise scent sense',
  wyrm.senses.some((s) => s.type === 'scent' && s.acuity === 'imprecise'), true);
check('keen smell trait itself is gone', byName('Keen Smell'), undefined);
check('magic weapons trait dropped entirely', byName('Magic Weapons'), undefined);
check('advantage prose becomes a circumstance bonus',
  byName('Ambusher').description, 'The wyrm gains a +2 circumstance bonus on attack rolls against any creature it has surprised.');

const wyrmBreath = byName('Frost Breath');
check('recharge stripped from the name', wyrmBreath !== undefined, true);
check('recharge becomes a cooldown sentence',
  wyrmBreath.description.includes("can't use this ability again for 1d4 rounds"), true);
check('breath DC still recomputed', wyrmBreath.description.includes(`DC ${tables.spellDCFor(13, 'moderate')}`), true);

const tail = byName('Tail Swipe');
check('legendary actions become triggered reactions', [
  tail.actionType, tail.description.startsWith("Trigger The end of another creature's turn."),
], ['reaction', true]);

const { packAttackDice, translateNamedSpecial } = await load('mechanics5e.js');
check('pack attack dice scale with level',
  [packAttackDice(1), packAttackDice(8), packAttackDice(13), packAttackDice(20)],
  ['1d4', '1d6', '2d6', '2d8']);
check('pack tactics translates to Pack Attack',
  translateNamedSpecial({ name: 'Pack Tactics', description: 'x' }, { level: 8 }).description.includes('1d6 extra damage'), true);
check('unknown traits pass through untranslated',
  translateNamedSpecial({ name: 'Rampage', description: 'x' }, { level: 8 }), null);

// Innate-only casting classifies moderate; a mere ability DC still anchors
// the prose without inventing entries.
const innateOnly = parse5eStatBlock(GLOOM_CALLER).data;
innateOnly.specials = innateOnly.specials.filter((s) => s.name !== 'Spellcasting');
const { reparseSpecials } = await load('parse5e.js');
reparseSpecials(innateOnly);
const innateSpec = convert.convertCreature(innateOnly);
check('innate-only classified moderate', innateSpec.spell.tier, 'moderate');
check('innate-only still builds its entry', innateSpec.spellcasting.entries.map((e) => e.category), ['innate']);

// --- Builder path ------------------------------------------------------------
const draft = {
  ...convert.seedFromRoadMap('brute', 5),
  name: 'Test Brute',
  size: 'lg',
  rarity: 'common',
  traits: ['giant'],
  speed: 30,
  description: 'Big.',
  strikes: [{ name: 'Slam', kind: 'melee', damageType: 'bludgeoning' }],
  skills: [{ slug: 'athletics', tier: 'high' }],
};
const built = convert.specFromBuilder(draft);
check('builder uses road map tiers', [built.ac.tier, built.saves.fortitude.tier, built.hp.tier], ['low', 'high', 'high']);
check('builder values from tables', [built.ac.value, built.hp.value > 0], [tables.acFor(5, 'low'), true]);
check('builder strike statted', [built.strikes[0].bonus, built.strikes[0].damage],
  [tables.strikeBonusFor(5, 'high'), tables.strikeDamageFor(5, 'high').dice]);
check('builder skill from table', built.skills[0].mod, tables.skillFor(5, 'high'));
check('builder abilities from tiers', built.abilities.str, tables.abilityFor(5, 'high'));
check('builder spellless road map has no spell block', built.spell, null);

done('conversion is deterministic and table-driven');
