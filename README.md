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

## What does not convert

Spell lists, slots and limited-use economies do not map mechanically; the
module records spell DC/attack in a Spellcasting note and flags abilities for
review in the actor's notes. Legendary/lair actions come across as free
actions to re-cost by hand.

## Development

`npm test` — six suites, no Foundry needed: import graph, table consistency,
parser fixtures (both layouts), conversion determinism, actor payloads against
the pf2e schemas, and template/action wiring.
