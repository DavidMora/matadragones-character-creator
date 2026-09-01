/**
 * The rename map against a snapshot of the pf2e spells compendium's names
 * (test/spell-names.json, extracted from the system's spells-srd pack).
 *
 * Two invariants, both learned the hard way:
 * - every rename target must be a real spell, or the "renamed" spell can
 *   never resolve;
 * - no rename source may shadow a real spell - acid splash and caustic blast
 *   coexist in the compendium, and renaming one into the other would swap a
 *   resolvable spell for a different one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeCheck, load, root } from './harness.mjs';

const { SPELL_RENAMES, modernizeSpellNames } = await load('spellnames.js');
const { check, done } = makeCheck();

const packNames = new Set(JSON.parse(readFileSync(path.join(root, 'test', 'spell-names.json'), 'utf8')));
check('snapshot is a real index', packNames.size > 1000, true);

const badTargets = Object.entries(SPELL_RENAMES).filter(([, target]) => !packNames.has(target));
check('every rename target is a real compendium spell (bad: '
  + badTargets.map(([k, v]) => `${k}->${v}`).join(', ') + ')', badTargets.length, 0);

const shadowing = Object.keys(SPELL_RENAMES).filter((source) => packNames.has(source));
check('no rename source shadows a real spell (bad: ' + shadowing.join(', ') + ')',
  shadowing.length, 0);

check('no target is itself a source',
  Object.values(SPELL_RENAMES).some((name) => name in SPELL_RENAMES), false);

// The official wiki rows made it in.
check('wiki renames present', [
  SPELL_RENAMES['magic missile'],
  SPELL_RENAMES['finger of death'],
  SPELL_RENAMES['meteor swarm'],
  SPELL_RENAMES['zone of truth'],
  SPELL_RENAMES['animate dead'],
], ['force barrage', 'execute', 'falling stars', 'ring of truth', 'summon undead']);

// Prose renaming still behaves with the big list.
check('multi-word rename in prose', modernizeSpellNames('casts wail of the banshee'), 'casts wails of the damned');
check('shadowed names untouched', modernizeSpellNames('casts acid splash'), 'casts acid splash');

done('spell rename map is compendium-validated');
