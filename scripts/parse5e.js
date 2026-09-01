/**
 * Deterministic parser for pasted stat blocks from the world's oldest
 * roleplaying game, 5th edition - both the 2014 layout ("Armor Class",
 * "Saving Throws", "Challenge 5 (1,800 XP)") and the 2024 layout ("AC",
 * "Saves" inside the ability table, "CR 5").
 *
 * It is a text heuristic, so it reports what it could not find (`missing`)
 * instead of guessing. The optional AI parse in ai/assist.js exists for
 * pastes this cannot handle; the conversion maths downstream is identical
 * either way.
 */
import { parseCR, proficiencyForCR } from './baseline5e.js';

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const SIZE_WORDS = {
  tiny: 'tiny', small: 'sm', medium: 'med', large: 'lg', huge: 'huge', gargantuan: 'grg',
};

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twice: 2, thrice: 3,
};

/** Labels that start a data line. Order matters: longer variants first. */
const FIELD_LABELS = [
  'Armor Class', 'Hit Points', 'Saving Throws', 'Damage Vulnerabilities',
  'Damage Resistances', 'Damage Immunities', 'Condition Immunities',
  'Proficiency Bonus', 'Vulnerabilities', 'Resistances', 'Immunities',
  'Speed', 'Skills', 'Senses', 'Languages', 'Challenge', 'Gear', 'Initiative',
  'AC', 'HP', 'CR',
];

const SECTION_HEADERS = [
  'Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions',
  'Lair Actions', 'Mythic Actions', 'Villain Actions',
];

function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');
}

const clean = (s) => s.replace(/\s+/g, ' ').trim().replace(/[,;.]$/, '');

/** Mean of a dice expression like "2d8+6". */
export function diceAverage(expression) {
  const m = String(expression).match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
  if (!m) return Number(expression) || 0;
  const base = Number(m[1]) * (Number(m[2]) + 1) / 2;
  const flat = m[4] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return base + flat;
}

/**
 * Split the block into labelled fields and free-form ability text.
 *
 * A field line may wrap across lines in a PDF paste, so a continuation line
 * (one that starts with neither a known label, a section header, nor an
 * ability-name pattern) is glued onto the field before it.
 */
export function parse5eStatBlock(rawText) {
  const text = normalise(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const missing = [];
  if (lines.length === 0) return { ok: false, missing: ['everything'], data: null };

  const data = {
    name: lines[0],
    size: null,
    type: null,
    subtype: null,
    tags: '',
    ac: null,
    acNote: '',
    hp: null,
    hpFormula: '',
    speeds: { walk: null, others: [] },
    abilities: {},
    scores: {},
    saves: {},
    skills: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    senses: [],
    passivePerception: null,
    languages: [],
    cr: null,
    crText: '',
    prof: null,
    specials: [],
    attacks: [],
    multiattack: null,
  };

  // --- Size and type line -------------------------------------------------
  const sizeLine = lines.slice(1, 4).find((l) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(l));
  if (sizeLine) {
    const m = sizeLine.match(
      /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+\w+)?\s+([A-Za-z-]+)\s*(?:\(([^)]+)\))?(?:[,.]\s*(.*))?$/i,
    );
    if (m) {
      data.size = SIZE_WORDS[m[1].toLowerCase()] ?? 'med';
      data.type = m[2].toLowerCase().replace(/[,.]$/, '');
      data.subtype = m[3]?.toLowerCase() ?? null;
      data.tags = m[4] ?? '';
    }
  }
  if (!data.size) missing.push('size line');

  // --- Labelled fields ----------------------------------------------------
  const fieldPattern = new RegExp(`^(${FIELD_LABELS.join('|')})\\.?\\s*:?\\s*(.*)$`);
  const fields = {};
  for (const line of lines) {
    const m = line.match(fieldPattern);
    if (!m) continue;
    const label = m[1];
    // First occurrence wins: "Speed" also appears inside ability prose.
    if (!(label in fields)) fields[label] = m[2];
  }
  const field = (...labels) => {
    for (const label of labels) if (fields[label] !== undefined) return fields[label];
    return undefined;
  };

  const acText = field('Armor Class', 'AC');
  if (acText) {
    const m = acText.match(/(\d+)\s*(?:\(([^)]+)\))?/);
    if (m) {
      data.ac = Number(m[1]);
      data.acNote = m[2] ?? '';
    }
  }
  if (data.ac === null) missing.push('Armor Class');

  const hpText = field('Hit Points', 'HP');
  if (hpText) {
    const m = hpText.match(/(\d+)\s*(?:\(([^)]+)\))?/);
    if (m) {
      data.hp = Number(m[1]);
      data.hpFormula = m[2] ?? '';
    }
  }
  if (data.hp === null) missing.push('Hit Points');

  const speedText = field('Speed');
  if (speedText) {
    const walk = speedText.match(/^(\d+)\s*ft/);
    if (walk) data.speeds.walk = Number(walk[1]);
    for (const m of speedText.matchAll(/\b(burrow|climb|fly|swim)\s+(\d+)\s*ft\.?( \(hover\))?/gi)) {
      data.speeds.others.push({ type: m[1].toLowerCase(), value: Number(m[2]) });
    }
  }

  // --- Ability scores -----------------------------------------------------
  // 2014 per-ability or inline: "STR 18 (+4)" possibly all on one line.
  for (const m of text.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\b[.:]?\s*(\d+)\s*\(\s*([+-]?\d+)\s*\)/gi)) {
    const key = m[1].toLowerCase();
    data.scores[key] = Number(m[2]);
    data.abilities[key] = Number(m[3]);
  }
  // 2024 tri-column: "Str 23 +6 +11" is score, modifier, save.
  for (const m of text.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\b\.?\s+(\d+)\s+([+-]\d+)\s+([+-]\d+)/g)) {
    const key = m[1].toLowerCase();
    data.scores[key] = Number(m[2]);
    data.abilities[key] = Number(m[3]);
    data.saves[key] = Number(m[4]);
  }
  // Bare header-row layout: a line of six names, then six "N (+M)" pairs.
  if (Object.keys(data.abilities).length < 6) {
    const headerAt = lines.findIndex((l) => /^STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA$/i.test(l));
    if (headerAt >= 0) {
      const tail = lines.slice(headerAt + 1, headerAt + 8).join(' ');
      const pairs = [...tail.matchAll(/(\d+)\s*\(\s*([+-]?\d+)\s*\)/g)];
      if (pairs.length >= 6) {
        ABILITY_KEYS.forEach((key, i) => {
          data.scores[key] = Number(pairs[i][1]);
          data.abilities[key] = Number(pairs[i][2]);
        });
      }
    }
  }
  // A score without a modifier still determines one.
  for (const key of ABILITY_KEYS) {
    if (data.abilities[key] === undefined && data.scores[key] !== undefined) {
      data.abilities[key] = Math.floor((data.scores[key] - 10) / 2);
    }
  }
  if (Object.keys(data.abilities).length < 6) missing.push('ability scores');

  // --- Saves (2014 "Saving Throws Dex +5, Con +11") -----------------------
  const savesText = field('Saving Throws');
  if (savesText) {
    for (const m of savesText.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\w*\s+([+-]\d+)/gi)) {
      data.saves[m[1].slice(0, 3).toLowerCase()] = Number(m[2]);
    }
  }

  const skillsText = field('Skills');
  if (skillsText) {
    for (const m of skillsText.matchAll(/([A-Za-z][A-Za-z' ]+?)\s+([+-]\d+)/g)) {
      data.skills.push({ name: clean(m[1]), bonus: Number(m[2]) });
    }
  }

  const splitList = (value) => (value ? value.split(/[,;]/).map(clean).filter(Boolean) : []);
  data.resistances = splitList(field('Damage Resistances', 'Resistances'));
  data.vulnerabilities = splitList(field('Damage Vulnerabilities', 'Vulnerabilities'));
  data.conditionImmunities = splitList(field('Condition Immunities'));
  const immunities = splitList(field('Damage Immunities', 'Immunities'));
  // The 2024 layout merges damage and condition immunities into one list.
  const CONDITIONS = /^(blinded|charmed|deafened|exhaustion|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)$/i;
  for (const entry of immunities) {
    (CONDITIONS.test(entry) ? data.conditionImmunities : data.immunities).push(entry);
  }

  const sensesText = field('Senses');
  if (sensesText) {
    for (const m of sensesText.matchAll(/\b(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*ft/gi)) {
      data.senses.push({ type: m[1].toLowerCase(), range: Number(m[2]) });
    }
    const pp = sensesText.match(/passive Perception\s+(\d+)/i);
    if (pp) data.passivePerception = Number(pp[1]);
  }

  data.languages = splitList(field('Languages')).filter((l) => !/^(-|none)$/i.test(l));

  const crText = field('Challenge', 'CR');
  if (crText) {
    data.crText = crText;
    data.cr = parseCR(crText);
  }
  if (data.cr === null) missing.push('Challenge Rating');

  const profText = field('Proficiency Bonus');
  const profMatch = profText?.match(/([+-]?\d+)/);
  data.prof = profMatch ? Number(profMatch[1]) : data.cr !== null ? proficiencyForCR(data.cr) : 2;

  // --- Special abilities and actions --------------------------------------
  collectSpecials(lines, fieldPattern, data);
  extractAttacks(data);

  const ok = missing.length === 0;
  return { ok, missing, data };
}

/**
 * Everything after the labelled fields is "Name. Prose..." entries under
 * section headers. A new entry starts on a line that looks like a title:
 * short, capitalised, ending in a period (with an optional cost or recharge
 * note in parentheses) before the prose begins.
 */
const TITLE_PATTERN = /^([A-Z][\w'’ /-]{0,60}?(?:\s*\((?:[^)]{1,40})\))?)\.\s+(\S.*)$/;

function collectSpecials(lines, fieldPattern, data) {
  let section = 'trait';
  let current = null;
  let statsSeen = false;

  for (const line of lines.slice(1)) {
    const header = SECTION_HEADERS.find((h) => new RegExp(`^${h}$`, 'i').test(line));
    if (header) {
      section = header.toLowerCase().replace(/s$/, '');
      current = null;
      statsSeen = true;
      continue;
    }
    if (fieldPattern.test(line)) {
      statsSeen = true;
      current = null;
      continue;
    }
    if (/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(line)) continue;
    if (/^STR\s+DEX/i.test(line) || /^\d+\s*\([+-]?\d+\)/.test(line)) continue;
    if (/^(STR|DEX|CON|INT|WIS|CHA|Str|Dex|Con|Int|Wis|Cha)\b/.test(line) && /\d+\s*\(?[+-]/.test(line)) continue;

    const title = line.match(TITLE_PATTERN);
    if (title && statsSeen) {
      current = { name: clean(title[1]), section, description: title[2].trim() };
      data.specials.push(current);
    } else if (current) {
      current.description += ` ${line}`;
    }
  }
}

/**
 * Re-run attack and Multiattack extraction over `data.specials`. Used by the
 * AI parse path, whose transcription carries the same specials but no attack
 * structure - extraction stays deterministic either way.
 */
export function reparseSpecials(data) {
  data.attacks = [];
  data.multiattack = null;
  extractAttacks(data);
  return data;
}

/** Pull attack rolls out of action prose so the converter can re-stat them. */
function extractAttacks(data) {
  for (const special of data.specials) {
    if (special.section !== 'action') continue;

    if (/^multiattack$/i.test(special.name)) {
      const counts = {};
      for (const m of special.description.matchAll(
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+([A-Za-z ]{2,30}?)\s+attacks?\b/gi,
      )) {
        const count = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]) ?? 1;
        counts[clean(m[2]).toLowerCase()] = count;
      }
      const total = special.description.match(/\battacks?\s+(twice|three times|four times)\b/i);
      if (total && Object.keys(counts).length === 0) {
        counts['*'] = { twice: 2, 'three times': 3, 'four times': 4 }[total[1].toLowerCase()];
      }
      data.multiattack = { counts, text: special.description };
      continue;
    }

    const attack = special.description.match(
      /\b(Melee|Ranged)\s+(?:(?:Weapon|Spell)\s+)?Attack(?:\s+Roll)?:?\s*([+-]\d+)/i,
    );
    if (!attack) continue;

    const entry = {
      name: special.name,
      kind: attack[1].toLowerCase(),
      bonus: Number(attack[2]),
      reach: null,
      range: null,
      damage: [],
      text: special.description,
    };
    const reach = special.description.match(/\breach\s+(\d+)\s*ft/i);
    if (reach) entry.reach = Number(reach[1]);
    const range = special.description.match(/\brange\s+(\d+)(?:\s*\/\s*(\d+))?\s*ft/i);
    if (range) entry.range = { increment: Number(range[1]), max: range[2] ? Number(range[2]) : null };

    for (const m of special.description.matchAll(
      /(?:(\d+)\s*\(\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)|(\d+d\d+(?:\s*[+-]\s*\d+)?)|\b(\d+))\s+([A-Za-z]+)\s+damage/gi,
    )) {
      const dice = (m[2] ?? m[3])?.replace(/\s+/g, '') ?? m[4];
      entry.damage.push({
        dice,
        average: m[1] ? Number(m[1]) : diceAverage(dice),
        type: m[5].toLowerCase(),
      });
    }
    data.attacks.push(entry);
  }
}

/** Estimated damage per round, honouring Multiattack when it names attacks. */
export function damagePerRound(data) {
  const attackAverage = (attack) => attack.damage.reduce((sum, d) => sum + d.average, 0);
  if (data.attacks.length === 0) return 0;

  const counts = data.multiattack?.counts ?? {};
  let total = 0;
  let matched = false;
  for (const [named, count] of Object.entries(counts)) {
    if (named === '*') continue;
    const attack = data.attacks.find((a) => named.includes(a.name.toLowerCase())
      || a.name.toLowerCase().includes(named.split(' ').pop()));
    if (attack) {
      total += count * attackAverage(attack);
      matched = true;
    }
  }
  if (matched) return total;

  const best = Math.max(...data.attacks.map(attackAverage));
  const flat = counts['*'];
  return flat ? best * flat : best;
}
