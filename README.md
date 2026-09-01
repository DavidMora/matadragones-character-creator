# Matadragones Character Creator

A Foundry VTT module for PF2e that builds creatures two ways:

- **Build from scratch** with the *Building Creatures* road maps from GM Core:
  pick a level and a concept (brute, sniper, soldier, spellcaster…), and every
  statistic is read from the published tables. Adjust any tier; the number
  follows.
- **Import a stat block** from the world's oldest roleplaying game (5th
  edition), 2014 or 2024 layout. The importer is deterministic: it never copies
  a printed number onto the sheet. Instead it classifies each stat against
  what a creature of that CR is expected to have (high AC, low HP, extreme
  attack…), maps the CR to a PF2e level, and reads the actual values from the
  Building Creatures tables. The same paste always produces the same creature.

Both paths end in a real pf2e NPC actor with strikes, skills, abilities,
senses, immunities/resistances/weaknesses, and provenance notes.

## OpenAI (optional)

The module works with no API key at all. With one configured:

- **Parse with AI** — a fallback for pastes the deterministic parser cannot
  read. The model only transcribes into the same structure; the conversion
  maths afterwards is identical, so it cannot set a single stat.
- **Rewrite abilities in PF2e style** — polishes carried-over ability prose
  into remaster idiom. DCs and saves are recomputed from the tables after the
  rewrite, so a drifted number is corrected rather than trusted.
- **Portrait & token art** — paints an image from the creature's description
  and applies it to both the actor portrait and the prototype token.

The key is stored client-side only (never in the world database, so players
can never see it), requests go straight from the GM's browser to the API, and
every call reports its token usage and estimated cost.

## Usage

Open **Character Creator** from the Actors sidebar header (or the token scene
controls). GM only.

A macro-facing API is exposed at
`game.modules.get('matadragones-character-creator').api`:
`parse5eStatBlock(text)`, `convertCreature(parsed, {level, tiers})`,
`specFromBuilder(draft)`, `createCreatureActor(spec)`.

## Spellcasting

Spell lists convert into real spellcasting entries on the Spells tab: innate
lists become an innate entry (per-day uses on each spell, at-will and constant
spells marked the way official bestiary data marks them), leveled casters
become a spontaneous entry with their slot counts, and every spell name is
mapped to its remaster name and resolved against the pf2e spells compendium.
A name with no compendium match is never guessed: it is listed in an
"Unconverted Spells" note on the sheet for the GM to replace.

## Designing a creature from a sentence

The builder tab takes a brief - "an evil necromancer who raises the fallen
mid-fight" - plus your party's level and size and the role you want the
creature to play, and asks OpenAI for a *concept*: name, description, traits,
a road map, and a tier for each statistic. It cannot propose a number: the
schema has no field for AC, HP, an attack bonus, damage, a save, a skill
modifier or a DC, so every value still comes out of the Building Creatures
tables, and abilities written with a bare "DC" get the creature's real one.

The creature's **level** is not the model's either. It comes from your party
level and the chosen role through the published encounter-building tables
(solo boss is party+3, boss +2, elite +1, matched, lackey -2, minion -4), and
the panel shows what the result costs in XP and how it rates against your
party's budget before you create anything.

Every draft - typed by hand or proposed by the model - is checked against the
creature-building rules. Hard rules are the tables' own vocabulary (AC has no
terrible column, HP has three tiers, spell DCs stop at moderate, levels run
-1 to 24) and are corrected automatically, with each correction reported.
Budget warnings flag a creature with more than two extreme statistics, or one
whose power score falls outside the range the published road maps occupy -
a band measured from those road maps, so anything the book endorses passes.

## Spells, abilities and gear

The builder keeps one editable list of each. Whatever the AI proposes lands
there as rows you can tune - change a spell's frequency, drop an ability you
do not want - alongside anything you drag in from a compendium or the
sidebar, and gear you simply type by name. What the panel shows is what gets
created.

Dropped documents are cloned exactly as they are, so their rules elements
keep working; names typed or proposed by the model are matched against the
compendium when the actor is created. Dropped NPC attacks contribute their
name and are re-statted from the tables like any other Strike.

## Gear

Weapons, armour and shields are read from three places - the AC parenthetical
("18 (chain mail, shield)"), the 2024 layout's Gear line, and the names of
Strikes that are weapons rather than body parts - then resolved against the
pf2e equipment compendium and added to the creature's inventory, held or worn
the way official bestiary data does it. Natural attacks (bite, claw, slam)
never become items.

Following the Building Creatures guidance that a creature's statistics already
account for its gear, none of this touches a number: AC, Strikes, HP and saves
are identical with or without the inventory, and a test asserts exactly that.
The builder tab has a free-text gear field with the same behaviour.

## Source-game-exclusive mechanics

Machinery the source game has and PF2e does not is translated to the PF2e
idiom rather than carried as dead prose: Legendary Resistance becomes a 3/day
free action the sheet tracks, Magic Resistance a +1 status bonus to saves
against magic, Pack Tactics the wolf-style Pack Attack (extra damage scaled by
level), Keen Smell an imprecise scent sense, Sunlight Sensitivity the Light
Blindness idiom, and "(Recharge 5-6)" tags a can't-use-again-for-1d4-rounds
sentence. Legendary and mythic actions become reactions triggered at the end
of another creature's turn. Inside all remaining prose, advantage and
disadvantage become +2/-2 circumstance modifiers. Unrecognised traits pass
through untouched - a wrong translation is worse than prose the GM can judge.

The spell rename map is the official list from the pf2e wiki's
Remaster-Changes page plus curated 5e equivalents, validated by a test against
a snapshot of the spells compendium: every rename target must be a real
spell, and no source may shadow one that still exists.

## What does not convert

Limited-use ability economies (recharge, legendary action budgets) do not map
mechanically; legendary/lair actions come across as free actions to re-cost by
hand.

## Development

`npm test` — six suites, no Foundry needed: import graph, table consistency,
parser fixtures (both layouts), conversion determinism, actor payloads against
the pf2e schemas, and template/action wiring.
