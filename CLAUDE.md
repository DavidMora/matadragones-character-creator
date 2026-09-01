# Matadragones Character Creator

A Foundry VTT module (PF2e) that creates NPC actors from the GM Core
*Building Creatures* tables - either built from scratch by road map, or
imported from a 5th-edition stat block. Sibling of
`../pf2e-alternative-system-ai-generator`; the OpenAI plumbing
(`scripts/ai/openai.js`, `scripts/ai/image.js`) is adapted from there and its
CLAUDE.md gotchas (ApplicationV2, settings NaN trap, world-readable settings)
apply here too.

## Non-negotiables

- **No imported number reaches the sheet.** The pipeline is
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
- **The OpenAI key stays client-scoped.** World settings are readable by every
  player regardless of `restricted`.
- **pf2e schemas were verified against the system source** (v7.12/v8.4):
  NPC skills are `lore` items (`system.mod.value`), strikes are `melee` items
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
| Stat block text → structure (2014+2024) | `scripts/parse5e.js` |
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
fail. Doing that here found the orphan-DC substitution had no coverage
(a mutation survived); assume more of those exist before trusting a new test.
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
