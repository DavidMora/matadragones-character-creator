/**
 * Encounter budgets, so "challenge my 5th level party" resolves to a creature
 * level by published arithmetic rather than by a model's guess.
 *
 * Both tables are reproduced from GM Core's Building Encounters and verified
 * against the pf2e system's own implementation (`xpCreatureDifferences` and
 * `generateEncounterBudgets`): a creature's XP comes from its level relative
 * to the party's, and a party's budget is 20 XP per character scaled by
 * threat.
 */
import { clampLevel } from './tables.js';

/** XP a creature costs, keyed by (creature level - party level). */
export const XP_BY_DIFFERENCE = new Map([
  [-4, 10], [-3, 15], [-2, 20], [-1, 30], [0, 40], [1, 60], [2, 80], [3, 120], [4, 160],
]);

/** Encounter XP budgets for a party of `partySize`. */
export function encounterBudgets(partySize) {
  const budget = Math.max(1, partySize) * 20;
  return {
    trivial: Math.floor(budget * 0.5),
    low: Math.floor(budget * 0.75),
    moderate: budget,
    severe: Math.floor(budget * 1.5),
    extreme: Math.floor(budget * 2),
  };
}

/**
 * What one creature of this level costs against this party. Differences
 * beyond the printed table are clamped to its ends, as the system does: a
 * creature five levels below the party is not worth less than the -4 entry.
 */
export function creatureXP(partyLevel, creatureLevel) {
  const difference = Math.min(Math.max(creatureLevel - partyLevel, -4), 4);
  return XP_BY_DIFFERENCE.get(difference) ?? 0;
}

export const THREAT_LEVELS = ['trivial', 'low', 'moderate', 'severe', 'extreme'];

/** Where a total sits against a party's budgets. */
export function rateEncounter(totalXP, partySize) {
  const budgets = encounterBudgets(partySize);
  for (const threat of THREAT_LEVELS) {
    if (totalXP <= budgets[threat]) return threat;
  }
  return 'extreme';
}

/**
 * The roles a GM actually asks for, as level offsets from the party.
 *
 * The offsets are the published relative levels those roles occupy; the
 * labels are this module's vocabulary for them, and `count` is the typical
 * number of such creatures in an encounter, used to sanity-check the budget.
 */
export const ROLES = {
  solo: { label: 'MCC.Role.Solo', offset: 3, typicalCount: 1 },
  boss: { label: 'MCC.Role.Boss', offset: 2, typicalCount: 1 },
  elite: { label: 'MCC.Role.Elite', offset: 1, typicalCount: 2 },
  matched: { label: 'MCC.Role.Matched', offset: 0, typicalCount: 3 },
  lackey: { label: 'MCC.Role.Lackey', offset: -2, typicalCount: 4 },
  minion: { label: 'MCC.Role.Minion', offset: -4, typicalCount: 6 },
};

/** The creature level a role implies for this party, clamped to the tables. */
export function levelForRole(partyLevel, role) {
  const offset = ROLES[role]?.offset ?? 0;
  return clampLevel(Number(partyLevel) + offset);
}

/**
 * A plain-language reading of what one such creature does to the party's
 * encounter budget, so the GM sees the consequence before creating it.
 */
export function budgetSummary(partyLevel, partySize, creatureLevel) {
  const xp = creatureXP(partyLevel, creatureLevel);
  const budgets = encounterBudgets(partySize);
  return {
    xp,
    budgets,
    alone: rateEncounter(xp, partySize),
    // How many fit inside a moderate encounter, which is the usual yardstick.
    fitModerate: xp > 0 ? Math.floor(budgets.moderate / xp) : 0,
  };
}
