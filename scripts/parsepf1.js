/**
 * Deterministic parser for Pathfinder First Edition stat blocks.
 *
 * PF1e blocks are laid out in labelled sections - DEFENSE, OFFENSE,
 * STATISTICS - with a dense, comma-separated grammar. The output is the same
 * shape `parse5e.js` produces, so everything downstream (classification, the
 * tables, the actor builder) is shared; only the vocabulary and the
 * expectations differ.
 *
 * The one structural advantage over 5e: PF1e prints Fortitude, Reflex and
 * Will, so `saves` carries the real numbers instead of ability modifiers
 * standing in for them.
 */
import { parseCR } from './baselinepf1.js';

const SIZE_WORDS = {
  fine: 'tiny', diminutive: 'tiny', tiny: 'tiny', small: 'sm', medium: 'med',
  large: 'lg', huge: 'huge', gargantuan: 'grg', colossal: 'grg',
};

/** PF1e creature types, as its type line writes them. */
const TYPE_WORDS = [
  'aberration', 'animal', 'construct', 'dragon', 'fey', 'humanoid', 'magical beast',
  'monstrous humanoid', 'ooze', 'outsider', 'plant', 'undead', 'vermin',
];

const clean = (s) => String(s).replace(/\s+/g, ' ').trim().replace(/[,;.]$/, '');

function normalise(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[−–—]/g, '-')
    .replace(/[''’]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/**
 * PF1e writes ability scores, and a creature with no score at all (a
 * mindless ooze's Intelligence) prints an em dash rather than a number.
 */
const modifierFromScore = (score) => Math.floor((Number(score) - 10) / 2);

export function parsePF1eStatBlock(rawText) {
  const text = normalise(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const missing = [];
  if (lines.length === 0) return { ok: false, missing: ['everything'], data: null };

  const data = {
    system: 'pf1e',
    name: lines[0].replace(/\s*CR\s*[\d/]+\s*$/i, '').trim(),
    size: null,
    type: null,
    subtype: null,
    tags: '',
    ac: null,
    acNote: '',
    hp: null,
    hpFormula: '',
    gearLine: '',
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
    prof: 0,
    specials: [],
    attacks: [],
    multiattack: null,
    spellcasting: null,
  };

  // --- CR, which PF1e puts on the name line -------------------------------
  const crMatch = text.match(/\bCR\s*([\d]+(?:\s*\/\s*\d+)?)/i);
  if (crMatch) {
    data.crText = crMatch[1].trim();
    data.cr = parseCR(data.crText);
  }
  if (data.cr === null) missing.push('CR');

  // --- Type line: "N Medium humanoid (human)" -----------------------------
  const typeLine = lines.slice(1, 6).find((l) => new RegExp(`\\b(${Object.keys(SIZE_WORDS).join('|')})\\b`, 'i').test(l)
    && new RegExp(`\\b(${TYPE_WORDS.join('|')})\\b`, 'i').test(l));
  if (typeLine) {
    const size = typeLine.match(new RegExp(`\\b(${Object.keys(SIZE_WORDS).join('|')})\\b`, 'i'));
    if (size) data.size = SIZE_WORDS[size[1].toLowerCase()];
    const type = typeLine.match(new RegExp(`\\b(${TYPE_WORDS.join('|')})\\b`, 'i'));
    if (type) data.type = type[1].toLowerCase();
    const subtype = typeLine.match(/\(([^)]+)\)/);
    if (subtype) data.subtype = subtype[1].toLowerCase();
  }
  if (!data.size) missing.push('type line');

  const field = (label) => {
    const m = text.match(new RegExp(`(?:^|\\n|;\\s*)${label}\\s+([^\\n;]+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  // --- DEFENSE -------------------------------------------------------------
  const acText = text.match(/\bAC\s+(\d+)((?:,\s*(?:touch|flat-footed)\s+\d+)*)\s*(?:\(([^)]*)\))?/i);
  if (acText) {
    data.ac = Number(acText[1]);
    data.acNote = acText[3] ?? '';
  } else missing.push('AC');

  const hpText = text.match(/\bhp\s+(\d+)\s*(?:\(([^)]*)\))?/i);
  if (hpText) {
    data.hp = Number(hpText[1]);
    data.hpFormula = hpText[2] ?? '';
  } else missing.push('hp');

  const saveText = text.match(/\bFort\s*([+-]\d+)[^\n]*?\bRef\s*([+-]\d+)[^\n]*?\bWill\s*([+-]\d+)/i);
  if (saveText) {
    // PF1e prints the saves themselves, so these are real values rather than
    // ability modifiers standing in for them.
    data.saves = { fort: Number(saveText[1]), ref: Number(saveText[2]), will: Number(saveText[3]) };
  } else missing.push('saves');

  const dr = text.match(/\bDR\s+(\d+)\s*\/\s*([^\n;,]+)/i);
  if (dr) data.resistances.push(`${dr[1]}/${clean(dr[2])}`);
  const resist = field('Resist');
  if (resist) for (const part of resist.split(',')) data.resistances.push(clean(part));
  const immune = field('Immune');
  if (immune) {
    const CONDITIONS = /^(bleed|blinded|charm|confus|dazzled|deaf|disease|energy drain|exhaust|fatigue|fear|mind-affecting|paraly|petrif|poison|polymorph|prone|sleep|stun)/i;
    for (const part of immune.split(',')) {
      const entry = clean(part);
      (CONDITIONS.test(entry) ? data.conditionImmunities : data.immunities).push(entry);
    }
  }
  const weakness = field('Weaknesses');
  if (weakness) {
    for (const part of weakness.split(',')) {
      // "vulnerability to fire" and "vulnerable to cold" both name a type.
      data.vulnerabilities.push(clean(part).replace(/^vulnerab(?:le|ility)\s+to\s+/i, ''));
    }
  }

  // --- Senses and Perception ----------------------------------------------
  const senses = text.match(/\bSenses\s+([^\n]+)/i);
  if (senses) {
    for (const m of senses[1].matchAll(/\b(darkvision|low-light vision|blindsight|blindsense|tremorsense|scent|see in darkness)\s*(\d+)?/gi)) {
      data.senses.push({ type: m[1].toLowerCase().replace(/\s+/g, '-'), range: Number(m[2]) || 0 });
    }
  }
  const perception = text.match(/\bPerception\s*([+-]\d+)/i);
  if (perception) data.skills.push({ name: 'Perception', bonus: Number(perception[1]) });

  // --- OFFENSE --------------------------------------------------------------
  const speed = text.match(/\bSpeed\s+(\d+)\s*ft/i);
  if (speed) data.speeds.walk = Number(speed[1]);
  const speedLine = text.match(/\bSpeed\s+([^\n]+)/i);
  if (speedLine) {
    for (const m of speedLine[1].matchAll(/\b(burrow|climb|fly|swim)\s+(\d+)\s*ft/gi)) {
      data.speeds.others.push({ type: m[1].toLowerCase(), value: Number(m[2]) });
    }
  }

  extractAttacks(text, data);

  // --- STATISTICS -----------------------------------------------------------
  const abilityLine = text.match(/\bStr\s+([\d-]+),\s*Dex\s+([\d-]+),\s*Con\s+([\d-]+),\s*Int\s+([\d-]+),\s*Wis\s+([\d-]+),\s*Cha\s+([\d-]+)/i);
  if (abilityLine) {
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach((key, i) => {
      const raw = abilityLine[i + 1];
      // An em dash means the creature has no such ability at all.
      if (/^-+$/.test(raw)) {
        data.abilities[key] = -5;
        return;
      }
      data.scores[key] = Number(raw);
      data.abilities[key] = modifierFromScore(raw);
    });
  } else missing.push('ability scores');

  const skills = text.match(/\bSkills\s+([^\n]+)/i);
  if (skills) {
    for (const m of skills[1].matchAll(/([A-Za-z][A-Za-z' ()]+?)\s+([+-]\d+)/g)) {
      const name = clean(m[1]);
      if (!data.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        data.skills.push({ name, bonus: Number(m[2]) });
      }
    }
  }

  const languages = text.match(/\bLanguages\s+([^\n]+)/i);
  if (languages) {
    data.languages = languages[1].split(/[,;]/).map(clean)
      .filter((l) => l && !/^(-|none)$/i.test(l));
  }

  const gear = text.match(/\b(?:Combat Gear|Gear|Other Gear)\s+([^\n]+)/i);
  if (gear) data.gearLine = gear[1];

  collectSpecials(lines, data);

  return { ok: missing.length === 0, missing, data };
}

/**
 * PF1e attack lines: "Melee longsword +9/+4 (1d8+3/19-20)" or
 * "Melee 2 claws +12 (1d6+5 plus grab)". Iteratives after the first are the
 * same attack at a penalty, so only the leading bonus is kept.
 */
function extractAttacks(text, data) {
  for (const line of text.split('\n')) {
    const kind = line.match(/^\s*(Melee|Ranged)\s+(.*)$/i);
    if (!kind) continue;
    const isMelee = kind[1].toLowerCase() === 'melee';

    for (const entry of kind[2].split(/,(?![^()]*\))| and (?![^()]*\))/)) {
      const m = entry.match(/^\s*(?:(\d+)\s+)?([A-Za-z][A-Za-z' -]*?)\s*([+-]\d+)(?:\/[+-]\d+)*\s*(?:\(([^)]*)\))?/);
      if (!m) continue;
      const damage = [];
      const detail = m[4] ?? '';
      const dice = detail.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/);
      if (dice) {
        damage.push({
          dice: dice[1].replace(/\s+/g, ''),
          average: diceAverage(dice[1]),
          // PF1e rarely states the damage type on a natural attack; the
          // weapon name is the better signal and the converter maps it.
          type: damageTypeFor(m[2]),
        });
      }
      const attack = {
        name: titleCase(clean(m[2])),
        kind: isMelee ? 'melee' : 'ranged',
        bonus: Number(m[3]),
        reach: isMelee ? 5 : null,
        range: null,
        damage,
        count: Number(m[1]) || 1,
        text: entry.trim(),
      };
      if (attack.name) data.attacks.push(attack);
    }
  }

  const reach = text.match(/\bReach\s+(\d+)\s*ft/i);
  if (reach) for (const attack of data.attacks) if (attack.kind === 'melee') attack.reach = Number(reach[1]);

  // Multiple natural attacks in one line are PF1e's full attack: record the
  // counts the way the 5e path records Multiattack, so damage per round is
  // computed identically downstream.
  const counts = {};
  for (const attack of data.attacks) if (attack.count > 1) counts[attack.name.toLowerCase()] = attack.count;
  if (Object.keys(counts).length) data.multiattack = { counts, text: 'full attack' };
}

const NATURAL_DAMAGE = [
  [/bite|jaws|fangs/i, 'piercing'],
  [/claw|talon|rake|rend/i, 'slashing'],
  [/slam|hoof|stomp|tail|wing|gore|tentacle/i, 'bludgeoning'],
  [/sword|scimitar|axe|falchion|glaive/i, 'slashing'],
  [/spear|bow|dagger|pick|lance|bolt|arrow|sting/i, 'piercing'],
  [/hammer|mace|club|staff|flail/i, 'bludgeoning'],
];

function damageTypeFor(name) {
  for (const [pattern, type] of NATURAL_DAMAGE) if (pattern.test(name)) return type;
  return 'bludgeoning';
}

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function diceAverage(expression) {
  const m = String(expression).match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
  if (!m) return Number(expression) || 0;
  const base = (Number(m[1]) * (Number(m[2]) + 1)) / 2;
  const flat = m[4] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return base + flat;
}

/**
 * Special abilities. PF1e prints them under SPECIAL ABILITIES with the name
 * followed by a type in parentheses - "Breath Weapon (Su)" - and also names
 * them inline under Special Attacks and SQ.
 */
const PF1_TITLE = /^([A-Z][\w'’ -]{0,50})\s*\((Ex|Su|Sp)\)\s*(.*)$/;

function collectSpecials(lines, data) {
  let current = null;
  for (const line of lines) {
    const title = line.match(PF1_TITLE);
    if (title) {
      current = {
        name: clean(title[1]),
        section: /aura|immun|resist|regenerat|damage reduction/i.test(title[1]) ? 'trait' : 'action',
        description: title[3].trim(),
      };
      data.specials.push(current);
      continue;
    }
    // A section header or a labelled line ends the previous ability.
    if (/^(DEFENSE|OFFENSE|STATISTICS|TACTICS|SPECIAL ABILITIES|ECOLOGY)\b/i.test(line)
      || /^(AC|hp|Fort|Melee|Ranged|Speed|Str|Base Atk|Feats|Skills|Languages|SQ|Gear|Senses|Aura|Immune|Resist|Weaknesses|Space|Special Attacks)\b/i.test(line)) {
      current = null;
      continue;
    }
    if (current) current.description += ` ${line}`;
  }
}
