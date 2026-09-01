/**
 * Parser for Pathfinder Second Edition stat blocks.
 *
 * This one is different in kind from the other two, and the difference is the
 * whole point of it. The 5e and PF1e importers must not let a printed number
 * reach the sheet: those numbers describe a different game, so each is
 * classified into a tier and the value is read from the Building Creatures
 * tables. A PF2e stat block's numbers ARE the target system's numbers. Deriving
 * them from tiers would take an exact creature, round it to the nearest tier,
 * and hand back something close but wrong.
 *
 * So this path transcribes: AC 24 stays AC 24, +18 stays +18. It produces a
 * finished spec directly rather than the intermediate shape the converters
 * use, and `convert.js` never sees it.
 */
import { clampLevel } from './tables.js';
import { mapLanguages } from './convert.js';

const SIZES = { tiny: 'tiny', small: 'sm', medium: 'med', large: 'lg', huge: 'huge', gargantuan: 'grg' };
const RARITIES = ['common', 'uncommon', 'rare', 'unique'];

const SENSE_ACUITY = {
  darkvision: 'precise', 'greater-darkvision': 'precise', 'low-light-vision': 'precise',
  echolocation: 'precise', truesight: 'precise', lifesense: 'imprecise',
  scent: 'imprecise', tremorsense: 'imprecise', 'wavesense': 'imprecise',
};

const clean = (s) => String(s).replace(/\s+/g, ' ').trim().replace(/[,;.]$/, '');

function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[−–—]/g, '-')
    .replace(/[''’]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/ /g, ' ')
    // Action glyphs are written a dozen ways; normalise the common ones so
    // they can be stripped rather than landing in the middle of a name.
    .replace(/\[(?:one|two|three)-actions?\]|\[reaction\]|\[free-action\]/gi, (m) => ` ${m} `)
    .replace(/[ \t]+/g, ' ');
}

const ACTION_COST = {
  'one-action': { actionType: 'action', actions: 1 },
  'two-actions': { actionType: 'action', actions: 2 },
  'three-actions': { actionType: 'action', actions: 3 },
  reaction: { actionType: 'reaction', actions: null },
  'free-action': { actionType: 'free', actions: null },
};

/**
 * Parse a PF2e stat block into a finished spec.
 *
 * @returns {{ok: boolean, missing: string[], spec: object|null}}
 */
export function parsePF2eStatBlock(rawText) {
  const text = normalise(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const missing = [];
  if (lines.length === 0) return { ok: false, missing: ['everything'], spec: null };

  // --- Name and level: "Goblin Warrior    Creature -1" --------------------
  const levelMatch = text.match(/\bCreature\s+(-?\d+)/i);
  const level = levelMatch ? clampLevel(Number(levelMatch[1])) : 1;
  if (!levelMatch) missing.push('creature level');
  const name = clean(lines[0].replace(/\bCreature\s+-?\d+\s*$/i, '')) || 'Imported Creature';

  // --- Trait line ----------------------------------------------------------
  const traitLine = lines.slice(1, 4).find((l) => new RegExp(`\\b(${Object.keys(SIZES).join('|')})\\b`, 'i').test(l));
  const traits = [];
  let size = 'med';
  let rarity = 'common';
  if (traitLine) {
    for (const raw of traitLine.split(/[\s,]+/)) {
      const word = raw.toLowerCase();
      if (SIZES[word]) { size = SIZES[word]; continue; }
      if (RARITIES.includes(word)) { rarity = word; continue; }
      if (/^[a-z][a-z-]*$/.test(word) && word.length > 2) traits.push(word);
    }
  } else missing.push('trait line');

  const field = (label) => {
    const m = text.match(new RegExp(`(?:^|\\n)${label}\\s+([^\\n]+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  // --- Perception and senses -----------------------------------------------
  const perceptionLine = field('Perception');
  const perceptionMod = Number(perceptionLine?.match(/([+-]\d+)/)?.[1] ?? 0);
  if (perceptionLine === null) missing.push('Perception');
  const senses = [];
  if (perceptionLine) {
    for (const part of perceptionLine.split(';').slice(1).join(';').split(',')) {
      const entry = clean(part);
      if (!entry) continue;
      const range = entry.match(/(\d+)\s*feet/i);
      const type = entry.replace(/\(([^)]*)\)/g, '').replace(/\d+\s*feet/i, '').trim()
        .toLowerCase().replace(/\s+/g, '-');
      const acuity = SENSE_ACUITY[type]
        ?? (/imprecise/i.test(entry) ? 'imprecise' : /vague/i.test(entry) ? 'vague' : null);
      if (!acuity) continue;
      senses.push({ type, acuity, ...(range ? { range: Number(range[1]) } : {}) });
    }
  }

  // --- Languages and skills -------------------------------------------------
  const languageLine = field('Languages');
  const languages = mapLanguages(
    (languageLine ?? '').split(/[,;]/).map(clean).filter(Boolean),
  );

  const skills = [];
  const skillLine = field('Skills');
  if (skillLine) {
    for (const m of skillLine.matchAll(/([A-Za-z][A-Za-z ]+?)\s*([+-]\d+)/g)) {
      const slug = clean(m[1]).toLowerCase().replace(/\s+/g, '-');
      skills.push({ slug, name: clean(m[1]), tier: null, mod: Number(m[2]) });
    }
  }

  // --- Ability modifiers: "Str +0, Dex +3, ..." ----------------------------
  const abilities = {};
  for (const m of text.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s*([+-]\d+)/gi)) {
    abilities[m[1].toLowerCase()] = Number(m[2]);
  }
  if (Object.keys(abilities).length < 6) missing.push('ability modifiers');

  // --- AC and saves ---------------------------------------------------------
  const acMatch = text.match(/\bAC\s+(\d+)/i);
  if (!acMatch) missing.push('AC');
  const saveMatch = text.match(/\bFort\s*([+-]\d+)[^\n]*?\bRef\s*([+-]\d+)[^\n]*?\bWill\s*([+-]\d+)/i);
  if (!saveMatch) missing.push('saves');

  const hpMatch = text.match(/\bHP\s+(\d+)/i);
  if (!hpMatch) missing.push('HP');

  const speedMatch = text.match(/\bSpeed\s+(\d+)\s*feet/i);
  const otherSpeeds = [];
  const speedLine = field('Speed');
  if (speedLine) {
    for (const m of speedLine.matchAll(/\b(burrow|climb|fly|swim)\s+(\d+)\s*feet/gi)) {
      otherSpeeds.push({ type: m[1].toLowerCase(), value: Number(m[2]) });
    }
  }

  const iwr = parseIWR(text);
  const { strikes, specials } = parseStrikesAndAbilities(lines, traitLine);

  const spec = {
    name,
    level,
    size,
    traits,
    rarity,
    languages: languages.value,
    languageDetails: languages.details,
    description: '',
    sourceNote: `Transcribed from a Pathfinder Second Edition stat block at level ${level}. `
      + 'Values were copied as printed rather than re-derived, because they are already this system\'s numbers.',
    perception: { tier: null, mod: perceptionMod },
    senses,
    abilities: {
      str: abilities.str ?? 0, dex: abilities.dex ?? 0, con: abilities.con ?? 0,
      int: abilities.int ?? 0, wis: abilities.wis ?? 0, cha: abilities.cha ?? 0,
    },
    ac: { tier: null, value: Number(acMatch?.[1] ?? 10) },
    saves: {
      fortitude: { tier: null, value: Number(saveMatch?.[1] ?? 0) },
      reflex: { tier: null, value: Number(saveMatch?.[2] ?? 0) },
      will: { tier: null, value: Number(saveMatch?.[3] ?? 0) },
    },
    hp: { tier: null, value: Number(hpMatch?.[1] ?? 1) },
    speeds: { land: Number(speedMatch?.[1] ?? 25), others: otherSpeeds },
    strikes,
    skills,
    spell: null,
    spellcasting: null,
    equipment: parseItems(field('Items')),
    specials,
    immunities: iwr.immunities,
    resistances: iwr.resistances,
    weaknesses: iwr.weaknesses,
    tiers: {},
    direct: true,
  };

  return { ok: missing.length === 0, missing, spec };
}

function parseIWR(text) {
  const out = { immunities: [], resistances: [], weaknesses: [] };
  const grab = (label) => {
    const m = text.match(new RegExp(`\\b${label}\\s+([^\\n;]+)`, 'i'));
    return m ? m[1].split(',').map(clean).filter(Boolean) : [];
  };
  out.immunities = grab('Immunities').map((entry) => entry.toLowerCase().replace(/\s+/g, '-'));
  for (const entry of grab('Resistances')) {
    const m = entry.match(/^(.*?)\s+(\d+)/);
    if (m) out.resistances.push({ type: clean(m[1]).toLowerCase().replace(/\s+/g, '-'), value: Number(m[2]) });
  }
  for (const entry of grab('Weaknesses')) {
    const m = entry.match(/^(.*?)\s+(\d+)/);
    if (m) out.weaknesses.push({ type: clean(m[1]).toLowerCase().replace(/\s+/g, '-'), value: Number(m[2]) });
  }
  return out;
}

/** "dogslicer, leather armor, shortbow (10 arrows)" */
function parseItems(line) {
  if (!line) return [];
  return line.split(',')
    .map((entry) => clean(entry).replace(/\([^)]*\)/g, '').trim().toLowerCase())
    .filter(Boolean)
    .map((name) => ({ name, uuid: null }));
}

/**
 * Strikes and abilities.
 *
 * A Strike line is "Melee [one-action] jaws +18 (magical), Damage 2d10+9
 * piercing"; anything else with an action glyph or a leading bold name is an
 * ability.
 */
function parseStrikesAndAbilities(lines, traitLine) {
  const strikes = [];
  const specials = [];

  for (const [index, line] of lines.entries()) {
    // The name line and the trait line are identity, not abilities; without
    // this they match the "short capitalised name, then prose" shape and the
    // creature arrives with "Silt Lurker Creature 6" as a passive ability.
    if (index === 0 || line === traitLine) continue;
    const strike = line.match(/^(Melee|Ranged)\b\s*(\[[^\]]*\])?\s*(.+)$/i);
    if (strike) {
      const kind = strike[1].toLowerCase();
      const rest = strike[3];
      const head = rest.match(/^([A-Za-z][A-Za-z' -]*?)\s*([+-]\d+)/);
      if (!head) continue;
      const damage = rest.match(/Damage\s+(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+([a-z]+)/i);
      const extra = [...rest.matchAll(/plus\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)/gi)]
        .map((m) => ({ dice: m[1].replace(/\s+/g, ''), type: m[2].toLowerCase() }));
      const traitBlock = rest.match(/\(([^)]*)\)/);
      const traits = traitBlock
        ? traitBlock[1].split(',')
          .map((raw) => {
            const entry = clean(raw).toLowerCase();
            // "reach 10 feet" is the printed form of the `reach-10` trait;
            // slugifying it whole yields `reach-10-feet`, which the system
            // silently splices out of the array.
            const reach = entry.match(/^reach\s+(\d+)/);
            if (reach) return `reach-${reach[1]}`;
            return entry.replace(/\s+/g, '-');
          })
          .filter(Boolean)
        : [];
      const increment = rest.match(/range increment\s+(\d+)\s*feet/i);
      const maxRange = rest.match(/\brange\s+(\d+)\s*feet/i);

      strikes.push({
        name: clean(head[1]).replace(/\b\w/g, (c) => c.toUpperCase()),
        kind,
        tier: null,
        bonus: Number(head[2]),
        damage: damage ? damage[1].replace(/\s+/g, '') : '1d4',
        damageType: damage ? damage[2].toLowerCase() : 'bludgeoning',
        extra,
        // Range traits are legacy; the increment belongs in system.range.
        traits: traits.filter((t) => !/^range/.test(t) && !/^\d/.test(t) && !/^reload/.test(t)),
        attackEffects: [],
        rangeIncrement: kind === 'ranged' ? Number(increment?.[1] ?? maxRange?.[1] ?? 30) : null,
        rangeMax: null,
      });
      continue;
    }

    // "Goblin Scuttle [reaction] Trigger ..." or "Attack of Opportunity [reaction]"
    const ability = line.match(/^([A-Z][\w'’ -]{1,50}?)\s*\[(one-action|two-actions|three-actions|reaction|free-action)\]\s*(.*)$/i);
    if (ability) {
      const cost = ACTION_COST[ability[2].toLowerCase()] ?? ACTION_COST.reaction;
      specials.push({
        name: clean(ability[1]),
        section: 'action',
        actionType: cost.actionType,
        actions: cost.actions,
        category: 'offensive',
        description: ability[3].trim(),
      });
      continue;
    }

    // A passive ability: "Name Description..." where the name is short and
    // the line is not one of the labelled statistics.
    const passive = line.match(/^([A-Z][\w'’ -]{1,40})\s+([A-Z(].{15,})$/);
    const isStatLine = /^(Perception|Languages|Skills|Items|AC|HP|Speed|Melee|Ranged|Immunities|Resistances|Weaknesses|Str|Dex|Con|Int|Wis|Cha)\b/i.test(line)
      // An ability-modifier run ("Str +5, Dex +3, ...") anywhere in the line.
      || /\b(Str|Dex|Con|Int|Wis|Cha)\s*[+-]\d/.test(line)
      || /\bCreature\s+-?\d+/i.test(line);
    if (passive && !isStatLine) {
      specials.push({
        name: clean(passive[1]),
        section: 'trait',
        actionType: 'passive',
        actions: null,
        category: 'defensive',
        description: passive[2].trim(),
      });
    }
  }

  return { strikes, specials };
}
