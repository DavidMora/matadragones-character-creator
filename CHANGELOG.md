# Changelog

## 1.0.0

First release. Tested on Foundry 13.351 with pf2e 7.12.2 and on Foundry
14.367 with pf2e 8.4.1.

### Build a creature

- **Road maps from GM Core's Building Creatures**: pick a level and a concept
  — brute, sniper, skirmisher, soldier, magical striker, spellcaster or
  balanced — and every statistic is read from the published tables. Change a
  tier and the number follows.
- **Describe it in a sentence instead.** "An evil necromancer who raises the
  fallen mid-fight", plus your party's level, size and the role you want the
  creature to play, and OpenAI proposes the concept: name, description,
  traits, a road map and a tier per statistic. It cannot propose a number —
  the schema has no field for AC, HP, an attack bonus, damage, a save, a
  skill modifier or a DC — so every value still comes from the tables.
- **The creature's level comes from the encounter rules**, not from the
  model: your party level and the chosen role (solo boss is party+3, boss +2,
  elite +1, matched, lackey −2, minion −4) through the published XP tables,
  with the cost and threat rating shown before you create anything.
- **Guardrails.** Hard rules are the tables' own vocabulary — AC has no
  terrible column, HP has three tiers, spell DCs stop at moderate, levels run
  −1 to 24 — and are corrected automatically with every correction reported.
  Budget warnings flag more than two extreme statistics, a creature strong at
  everything, or a power score outside the range the published road maps
  occupy.
- **Drag in spells, abilities and gear** from any compendium or the sidebar.
  Dropped documents are cloned exactly as they are, so their rules elements
  keep working. Everything the AI proposes lands in the same editable lists,
  so you can retune a spell's frequency or drop an ability you don't want.

### Import a stat block

Three systems, chosen with a dropdown, in two modes:

- **The world's oldest roleplaying game, 5th edition** (2014 or 2024 layout)
  and **Pathfinder First Edition** are *converted*. Their printed numbers
  describe a different game, so none is copied: each stat is ranked against
  what that system expects at that challenge rating, and the value comes from
  the Building Creatures tables. The same paste always produces the same
  creature.
- **Pathfinder Second Edition** blocks are *transcribed*. Those numbers are
  already this system's numbers, so AC 23 stays AC 23. Every transcribed
  value is checked against the published span for the creature's level, and
  anything well outside it is flagged.

Imports carry across spell lists (as real spellcasting entries resolved from
the compendium), gear (as inventory items), senses, languages, immunities,
resistances and weaknesses, with the vocabulary translated to remaster
naming throughout — spells, languages, damage types, conditions and creature
traits.

### Mechanics that only exist in the source system

Legendary Resistance becomes a 3/day free action the sheet tracks, Magic
Resistance a status bonus to saves, Pack Tactics the wolf-style Pack Attack,
Keen Smell an imprecise scent sense, Sunlight Sensitivity the Light Blindness
idiom. Legendary and mythic actions become reactions with the trigger stated,
recharge tags become cooldown sentences, and advantage and disadvantage
become circumstance modifiers. Anything unrecognised passes through
untouched.

### OpenAI, all optional

The module works with no API key. With one: transcribe a paste the
deterministic parser cannot read (each system has its own schema), rewrite
ability prose into PF2e idiom, and paint portrait and token artwork. The key
is stored client-side only — never in the world database, where every player
could read it — and each call reports its token usage and estimated cost.
