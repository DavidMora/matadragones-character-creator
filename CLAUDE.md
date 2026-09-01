# Matadragones Character Creator

A Foundry VTT module (PF2e) that creates NPC actors from the GM Core
*Building Creatures* tables - either built from scratch by road map, or
imported from a 5th-edition stat block. Sibling of
`../pf2e-alternative-system-ai-generator`; the OpenAI plumbing
(`scripts/ai/openai.js`, `scripts/ai/image.js`) is adapted from there and its
CLAUDE.md gotchas (ApplicationV2, settings NaN trap, world-readable settings)
apply here too.

## Non-negotiables

- **Converted and direct are different modes, not a detail.** A source whose
  numbers describe another game is *converted*: classify, then read the value
  from the tables. A PF2e block is *direct*: its numbers are already correct,
  so they are transcribed and `convert.js` never sees them. Adding a source
  means declaring which it is in `sources.js`; routing a PF2e block through
  the converter would silently round every exact value to the nearest tier.
- **No imported number reaches the sheet** (converted sources). The pipeline is
  parse → classify (tier per stat, vs CR baselines in `baseline5e.js`) →
  read values from `tables.js` for the mapped level. The AI parse is a
  transcription fallback that feeds the same pipeline; the AI rewrite has its
  output re-anchored by `convertAbilityText`. If you add a stat, it must flow
  through a table, not through the paste or the model.
- **Determinism is a feature.** Same input, same creature -
  `check-convert.mjs` asserts byte-identical double conversion. Keep it true.
- **The tables are transcriptions.** Do not "fix" a value in `tables.js` by
  arithmetic; check the book. `check-tables.mjs` catches internal
  inconsistency, not external truth.
- **Gear is descriptive, never mechanical.** Building Creatures is explicit
  that a creature's statistics already account for its equipment, so
  `equipment.js` must never feed back into AC, attack or damage;
  `check-equipment.mjs` asserts the numbers are identical with gear stripped.
- **Compendium-backed maps are validated by snapshot.** `spellnames.js` and
  `GEAR_MAP` are checked against `test/spell-names.json` /
  `test/equipment-names.json`: every target must resolve, and (for spells) no
  source may shadow a name the compendium still knows. Regenerate the
  snapshots after a system update rather than editing maps by hand; the spell
  list itself comes from the system's own
  `packs/pf2e/journals/remaster-changes.json`, not the wiki page, which is a
  stale copy with swapped dimensional anchor/lock rows.
- **Every schema is audited by `check-schemas.mjs`.** Structured Outputs
  strict mode requires each object to list *every* property in `required` and
  set `additionalProperties: false`; a property added without its `required`
  entry reads fine and fails at runtime as a 400 the GM sees only after
  pressing the button. That suite also enforces the no-numbers rule, so add
  schema fields with it running.
- **The concept schema must stay numberless.** `ai/concept.js` lets the model
  pick tiers, never values, and the creature's level comes from
  `encounter.js`, not the model. Adding a numeric field there would break the
  module's central promise; `check-builder.mjs` feeds it an over-tuned
  concept and asserts what comes back is inside the rules.
- **`enforceDraft` is the only way into the builder.** Anything that produces
  a draft (concept mapping, a future importer, a macro) runs through it, so
  an out-of-vocabulary tier can never reach the tables.
- **ApplicationV2 has no drag-drop support.** Listeners are wired by hand in
  `_onRender`, once, on the frame; `dragenter`/`dragleave` fire for child
  elements, so the zone counts nesting depth rather than toggling on every
  crossing. A drop zone must contain its own invitation text and keep a
  `min-height`, or it collapses to a strip nobody can hit.
- **A prepared caster's slots name their spells.** `slots.slotN.prepared` is
  a list of `{id}` pointing at the created spell items, so the slots can only
  be written *after* the spells exist; spontaneous entries carry counts only.
  Getting this wrong renders a full spell list as "Empty Slot (drag spell
  here)". Both shapes were read off the pathfinder-monster-core pack.
- **The OpenAI key stays client-scoped.** World settings are readable by every
  player regardless of `restricted`.
- **NPC skills are actor data, not items.** `system.skills.<slug>.base`.
  Emitting a `lore` item named "Athletics" renders a plausible number on the
  sheet while `getStatistic('athletics')` returns an untrained skill worth
  the bare ability modifier - so Grapple, Trip, `@Check` links and every
  skill macro roll ~10 points low. This module shipped that bug because
  "verified against the system source" meant reading `template.json` and
  seeing that `lore` items exist, rather than looking at what real NPCs
  store. Check the packs, not just the schema.
- **pf2e schemas were verified against the system source** (v7.12/v8.4):
  strikes are `melee` items
  with a `damageRolls` record and nullable `range` (range traits are legacy),
  abilities are `action` items. Perception is `system.perception.mod`
  (remaster). Re-verify in the bundle at
  `../pf2e-alternative-system-ai-generator/.local/data/Data/systems/pf2e/pf2e.mjs`
  before changing item payloads.

## Layout

| Concern | Lives in |
|---|---|
| Building Creatures tables, tiers, road maps | `scripts/tables.js` |
| 5e expectations by CR, CR→level | `scripts/baseline5e.js` |
| Import sources and which mode each uses | `scripts/sources.js` |
| Stat block text → structure (2014+2024) | `scripts/parse5e.js` |
| PF1e stat block → the same structure | `scripts/parsepf1.js`, `scripts/baselinepf1.js` |
| PF2e stat block → a finished spec, transcribed | `scripts/parsepf2.js` |
| Classification, spec building, DC rewriting | `scripts/convert.js` |
| Spec → pf2e actor payload | `scripts/actor.js` |
| Spell entries + compendium resolution | `scripts/spells.js`, `scripts/spellnames.js` |
| Gear extraction + compendium resolution | `scripts/equipment.js` |
| Source-game-only mechanics (Legendary Resistance, advantage, recharge) | `scripts/mechanics5e.js` |
| Encounter budgets, roles → creature level | `scripts/encounter.js` |
| Creature-building guardrails (hard rules + budget) | `scripts/creature-rules.js` |
| Drag-and-drop bookkeeping | `scripts/drops.js` |
| AI concept → builder draft | `scripts/ai/concept.js` |
| OpenAI text/image calls | `scripts/ai/` |
| The window (both tabs, `data-bind` state) | `scripts/apps/creator-view.js` |

The "spec" produced by `convertCreature`/`specFromBuilder` is the one shape
both tabs share and the only thing `actor.js` reads.

## One list, many sources

`draft.contents = { spells, specials, gear }` is the single editable set the
builder panel renders. The AI concept writes into it, a drag and drop writes
into it, and typing gear writes into it - so what the GM sees is what
`specFromBuilder` reads. Do not add a parallel field for a new source of
spells or items: an AI-only list that the panel could not show was exactly
what made the concept feel disconnected. An entry with a `uuid` is cloned
from that document at creation; one without is matched by name against the
compendium.

## UI state

`CreatorView` keeps all state on the instance; inputs carry
`data-bind="scope.path"` and a delegated change listener routes them
(`#onFieldChange`). Re-render freely - state survives. Foundry actions fire on
click only, so selects are bound via change, buttons via `data-action`.

## Testing

`npm test`, no Foundry needed (`test/harness.mjs` stubs globals).
`check-imports.mjs` runs first for the same reason as in the sibling repo: a
dangling import shows up in Foundry as a silently inactive module.
`check-templates.mjs` asserts every rendered `data-action` has a registered
handler and every `data-bind` scope is routed.

**A green suite proves nothing on its own** - break the code and watch it
fail. An adversarial audit ran 136 mutations against a 590-check suite and
**82 survived**, because the suite tested *wiring* (a value flows from A to
B) and not *content* (the value is right). The tell:
`check('AC from table', spec.ac.value, tables.acFor(9, 'moderate'))` asks
`convert.js` and `tables.js` the same question and checks they agree - it can
never notice the table is wrong.

The fix is literal expected values from an independent source: the golden
fixture in `test/tables-golden.json` pins every published number,
`check-actor.mjs` uses a hand-written spec with literal results, and the
vocabulary maps and `GEAR_MAP` are asserted entry by entry rather than
"resolves to something". When you add a table, a threshold or a mapping, ask
what literal a reviewer could check it against - and if the answer is "the
code", the test is worthless.
When a test fails, check the assertion before the code: the wisp DPR fixture
was wrong once already (printed averages, not dice means).

## Local Foundry

Uses the sibling repo's `.local` installs (gitignored there), with this module
symlinked into both data dirs:

```
node ../pf2e-alternative-system-ai-generator/.local/app/main.js   --dataPath=../pf2e-alternative-system-ai-generator/.local/data   --port=30000 --noupnp  # v13
node ../pf2e-alternative-system-ai-generator/.local/app14/main.js --dataPath=../pf2e-alternative-system-ai-generator/.local/data14 --port=30001 --noupnp  # v14
```

Enable "Matadragones Character Creator" in the world's Manage Modules.
