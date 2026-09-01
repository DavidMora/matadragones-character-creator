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

// --- Full conversion ---------------------------------------------------------
const spec = convert.convertCreature(reaver);
check('reaver converts at level 9', spec.level, 9);
check('reaver AC from table', spec.ac.value, tables.acFor(9, 'moderate'));
check('reaver fort from table', spec.saves.fortitude.value, tables.saveFor(9, 'high'));
check('reaver strikes keep identity', spec.strikes.map((s) => [s.name, s.kind, s.damageType]), [
  ['Bite', 'melee', 'piercing'],
  ['Claw', 'melee', 'slashing'],
]);
check('primary strike uses classified damage tier dice', spec.strikes[0].damage, tables.strikeDamageFor(9, tiers.damage).dice);
check('secondary strike sits one tier lower', spec.strikes[1].damage,
  tables.strikeDamageFor(9, { extreme: 'high', high: 'moderate', moderate: 'low', low: 'low' }[tiers.damage]).dice);
check('claw keeps its reach trait', spec.strikes[1].traits, ['reach-10']);
check('cold rider carried as extra damage', spec.strikes[0].extra, [{ dice: '2d6', type: 'cold' }]);
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

// Determinism: converting the same parse twice is byte-identical.
check('conversion is deterministic',
  JSON.stringify(convert.convertCreature(reaver)), JSON.stringify(spec));

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
check('lightning would map to electricity', convert.mapDamageType('lightning'), 'electricity');
check('necrotic maps to void', convert.mapDamageType('necrotic'), 'void');

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
