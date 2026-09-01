/**
 * Stat blocks in the two common layouts. Original creatures written for these
 * tests - the formats are the thing under test, not anybody's monster.
 */

/** 2014-style layout. */
export const FROST_REAVER = `Frost Reaver
Large monstrosity, chaotic evil
Armor Class 16 (natural armor)
Hit Points 136 (13d10 + 65)
Speed 40 ft., climb 30 ft.
STR 21 (+5) DEX 12 (+1) CON 20 (+5) INT 7 (-2) WIS 14 (+2) CHA 10 (+0)
Saving Throws Con +9, Wis +6
Skills Perception +6, Stealth +5
Damage Resistances cold; bludgeoning, piercing, and slashing from nonmagical attacks
Damage Immunities poison
Condition Immunities poisoned, frightened
Senses darkvision 60 ft., passive Perception 16
Languages Giant
Challenge 9 (5,000 XP)
Rime Body. A creature that touches the reaver or hits it with a melee attack while within 5 feet of it takes 4 (1d8) cold damage.
Keen Smell. The reaver has advantage on Wisdom (Perception) checks that rely on smell.
Actions
Multiattack. The reaver makes two claw attacks and one bite attack.
Bite. Melee Weapon Attack: +9 to hit, reach 5 ft., one target. Hit: 16 (2d10 + 5) piercing damage plus 7 (2d6) cold damage.
Claw. Melee Weapon Attack: +9 to hit, reach 10 ft., one target. Hit: 12 (2d6 + 5) slashing damage.
Frozen Breath (Recharge 5-6). The reaver exhales a blast of frost in a 30-foot cone. Each creature in that area must make a DC 17 Constitution saving throw, taking 45 (10d8) cold damage on a failed save, or half as much damage on a successful one.
Reactions
Ice Shield. The reaver adds 3 to its AC against one melee attack that would hit it.`;

/** 2024-style layout: merged Immunities, tri-column abilities, "CR". */
export const EMBER_WISP = `Ember Wisp
Small Elemental, Chaotic Neutral
AC 14
HP 44 (8d6 + 16)
Speed 10 ft., fly 50 ft. (hover)
Str 7 -2 -2
Dex 17 +3 +5
Con 14 +2 +2
Int 9 -1 -1
Wis 13 +1 +1
Cha 12 +1 +1
Skills Acrobatics +5, Stealth +7
Immunities fire, poison; poisoned, prone
Vulnerabilities cold
Senses darkvision 120 ft., passive Perception 11
Languages Ignan
CR 2 (XP 450; PB +2)
Traits
Illumination. The wisp sheds bright light in a 20-foot radius and dim light for an additional 20 feet.
Actions
Multiattack. The wisp attacks twice.
Singe. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) fire damage.
Cinder Bolt. Ranged Attack Roll: +5, range 60 ft. Hit: 6 (1d6 + 3) fire damage, and the target must succeed on a DC 12 Dexterity saving throw or catch fire.`;

/** 2014-style caster with both an innate list and leveled slots. */
export const GLOOM_CALLER = `Gloom Caller
Medium fiend, neutral evil
Armor Class 15 (natural armor)
Hit Points 91 (14d8 + 28)
Speed 30 ft.
STR 12 (+1) DEX 14 (+2) CON 15 (+2) INT 17 (+3) WIS 12 (+1) CHA 18 (+4)
Saving Throws Int +6, Cha +7
Skills Arcana +6, Deception +7
Damage Resistances cold, necrotic
Senses darkvision 120 ft., passive Perception 11
Languages Abyssal, Common
Challenge 7 (2,900 XP)
Innate Spellcasting. The caller's innate spellcasting ability is Charisma (spell save DC 15). It can innately cast the following spells, requiring no material components:
At will: mage hand, misty step
3/day each: dimension door, hold person
1/day each: phantasmal killer
Spellcasting. The caller is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). It has the following wizard spells prepared:
Cantrips (at will): acid splash, mage hand
1st level (4 slots): magic missile, mage armor
2nd level (3 slots): scorching ray
3rd level (2 slots): fireball
Actions
Shadow Claw. Melee Spell Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (3d6 + 4) necrotic damage, and the target is grappled (escape DC 15).`;

/** Loaded with source-game-exclusive machinery to exercise the translator. */
export const ELDER_WYRM = `Elder Wyrm
Huge dragon, chaotic evil
Armor Class 19 (natural armor)
Hit Points 225 (18d12 + 108)
Speed 40 ft., fly 80 ft.
STR 25 (+7) DEX 10 (+0) CON 22 (+6) INT 14 (+2) WIS 13 (+1) CHA 17 (+3)
Saving Throws Dex +5, Con +11, Wis +6
Skills Perception +11, Stealth +5
Damage Immunities cold
Senses darkvision 120 ft., passive Perception 21
Languages Common, Draconic
Challenge 13 (10,000 XP)
Legendary Resistance (3/Day). If the wyrm fails a saving throw, it can choose to succeed instead.
Magic Resistance. The wyrm has advantage on saving throws against spells and other magical effects.
Keen Smell. The wyrm has advantage on Wisdom (Perception) checks that rely on smell.
Magic Weapons. The wyrm's weapon attacks are magical.
Ambusher. The wyrm has advantage on attack rolls against any creature it has surprised.
Actions
Bite. Melee Weapon Attack: +12 to hit, reach 10 ft., one target. Hit: 18 (2d10 + 7) piercing damage plus 4 (1d8) cold damage.
Frost Breath (Recharge 5-6). The wyrm exhales frost in a 60-foot cone. Each creature in that area must make a DC 19 Constitution saving throw, taking 54 (12d8) cold damage on a failed save, or half as much damage on a successful one.
Legendary Actions
Tail Swipe. The wyrm makes one tail attack.
Frightful Advance. The wyrm moves up to half its speed.`;

/** A creature spec of the shape convert.js produces, for actor tests. */
export const SAMPLE_SPEC = {
  name: 'Test Horror',
  level: 7,
  size: 'lg',
  traits: ['beast'],
  rarity: 'common',
  languages: ['common'],
  languageDetails: 'telepathy 100 feet',
  description: 'A test creature.',
  sourceNote: 'Imported for tests.',
  perception: { tier: 'high', mod: 18 },
  senses: [{ type: 'darkvision', acuity: 'precise', range: 60 }],
  abilities: { str: 5, dex: 1, con: 5, int: -2, wis: 2, cha: 0 },
  ac: { tier: 'moderate', value: 24 },
  saves: {
    fortitude: { tier: 'high', value: 18 },
    reflex: { tier: 'low', value: 12 },
    will: { tier: 'moderate', value: 15 },
  },
  hp: { tier: 'moderate', value: 115 },
  speeds: { land: 40, others: [{ type: 'climb', value: 30 }] },
  strikes: [
    {
      name: 'Bite', kind: 'melee', tier: 'high', bonus: 18,
      damage: '2d8+9', damageType: 'piercing',
      extra: [{ dice: '2d6', type: 'cold' }], traits: [],
      rangeIncrement: null, rangeMax: null,
    },
    {
      name: 'Spit', kind: 'ranged', tier: 'high', bonus: 18,
      damage: '2d6+6', damageType: 'acid',
      extra: [], traits: [], rangeIncrement: 30, rangeMax: 120,
    },
  ],
  skills: [{ slug: 'athletics', name: 'Athletics', tier: 'moderate', mod: 15 }],
  spell: { tier: 'moderate', dc: 22, attack: 14 },
  specials: [
    {
      name: 'Frozen Breath', section: 'action', actionType: 'action', actions: 2,
      category: 'offensive', description: 'DC 22 basic Fortitude save. <b>Injected</b> markup stays text.',
    },
    {
      name: 'Ice Shield', section: 'reaction', actionType: 'reaction', actions: null,
      category: 'defensive', description: 'Raises a shield of ice.',
    },
  ],
  immunities: ['poison', 'fear-effects'],
  resistances: [{ type: 'cold', value: 8 }],
  weaknesses: [{ type: 'fire', value: 8 }],
  tiers: {},
};
