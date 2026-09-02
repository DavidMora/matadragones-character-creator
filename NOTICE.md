# Notices

## Ownership and disclaimer

**This module is unofficial fan content. It is free, and always will be.**

The author claims no ownership of any of the intellectual property it
interoperates with, and this project is not affiliated with, sponsored by, or
endorsed by any of the rights holders named below.

- **Pathfinder**, the Pathfinder logo, *GM Core*, *Player Core*, *Monster
  Core* and related marks are trademarks of **Paizo Inc.** This module is not
  published, endorsed, or specifically approved by Paizo. For more
  information about Paizo Inc. and Paizo products, visit
  [paizo.com](https://paizo.com).
- **Dungeons & Dragons**, **D&D**, and their logos are trademarks of
  **Wizards of the Coast LLC**, a subsidiary of **Hasbro, Inc.** This module
  is unofficial fan content, permitted under Wizards of the Coast's Fan
  Content Policy, and is neither approved nor endorsed by Wizards. Portions
  of the materials used are property of Wizards of the Coast.
- Any other game, publisher, or product named anywhere in this repository is
  named for identification and compatibility only. All trademarks belong to
  their respective owners.

The module is distributed free of charge under the MIT licence (see
`LICENSE`), which covers the author's own code and nothing else. It is not
sold, it carries no advertising, and it asks for no payment or donation. The
only money it can ever cost a user is what they choose to spend with OpenAI
through their own account, using their own API key, on a feature that is
entirely optional.

## Rules content

- The creature-building tables in `scripts/tables.js` and the encounter
  budgets in `scripts/encounter.js` are transcribed from the *Pathfinder GM
  Core* "Building Creatures" and "Building Encounters" rules by Paizo Inc.,
  available under the ORC License.
- The remaster renaming data in `scripts/spellnames.js` is derived from the
  Pathfinder Second Edition system for Foundry VTT (its own Remaster Changes
  journal), which is community-maintained and distributed under the Apache
  License 2.0.

## Importers

The importers convert text the user supplies. **No third-party stat blocks
are included in this module, and no publisher's tables are reproduced.**

- `scripts/baseline5e.js` and `scripts/baselinepf1.js` hold original
  empirical fits describing what a creature of a given challenge rating is
  expected to look like in those systems. They exist only to rank a printed
  statistic as high or low; they are not reproductions of any published
  table. The 5th-edition fits are informed by the Systems Reference Document
  5.1 (Creative Commons Attribution 4.0, Wizards of the Coast LLC).
- The stat block fixtures in `test/fixtures.mjs` are original creatures
  written for this repository. The layouts are what is under test, not
  anybody's monster.
- Nothing a user pastes is stored, transmitted, or shared by the module,
  except to OpenAI when the user explicitly presses a button that says so.

## Generated content

Artwork and text produced through the OpenAI integration are generated with
the user's own account and are subject to OpenAI's terms.
