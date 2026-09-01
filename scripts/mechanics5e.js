/**
 * Mechanics that exist only in the source game, translated to what PF2e
 * actually uses. Two layers, both deterministic:
 *
 * - `translateNamedSpecial` recognises well-known traits by name and replaces
 *   them wholesale with their PF2e idiom: Legendary Resistance becomes a
 *   3/day free action, Magic Resistance a status bonus to saves against
 *   magic, Pack Tactics the wolf-style Pack Attack, Keen Smell an imprecise
 *   scent sense, and so on. A recognised trait never leaks source-game
 *   wording onto the sheet.
 * - `translateMechanicsText` rewrites the source game's grammar inside any
 *   remaining prose: advantage/disadvantage become circumstance bonuses and
 *   penalties, recharge tags become cooldown rounds, legendary-action framing
 *   becomes a reaction trigger.
 *
 * Anything not recognised passes through untouched - a wrong translation is
 * worse than prose the GM can read and judge.
 */

/** Extra damage dice for Pack Attack, scaled the way PF2e scales such riders. */
export function packAttackDice(level) {
  if (level < 5) return '1d4';
  if (level < 12) return '1d6';
  if (level < 18) return '2d6';
  return '2d8';
}

/**
 * Recharge X-6 -> "can't use for N rounds". A 2-in-6 recharge comes back in
 * about three turns, which is what PF2e prints as 1d4 rounds; recharge 6 is
 * rarer and maps to 1d6.
 */
export const RECHARGE_ROUNDS = { 4: '1d4', 5: '1d4', 6: '1d6' };

/**
 * Recognise a named source-game trait and return its PF2e replacement, or
 * null to let the generic pipeline handle it.
 *
 * Returns `{ drop: true }` for traits PF2e has no use for, optionally with
 * `senses` to add. Otherwise returns a full special
 * `{ name, actionType, actions, category, description, frequency? }`.
 */
export function translateNamedSpecial(special, { level }) {
  const name = special.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const text = special.description ?? '';

  if (/^legendary resistance$/i.test(name)) {
    const uses = Number(special.name.match(/\((\d+)\s*\/\s*day\)/i)?.[1] ?? 3);
    return {
      name: 'Legendary Resistance',
      actionType: 'free',
      actions: null,
      category: 'defensive',
      frequency: { max: uses, per: 'day' },
      description: 'Trigger The creature fails a saving throw. '
        + 'Effect The creature succeeds at the saving throw instead.',
    };
  }

  if (/^magic resistance$/i.test(name)) {
    return {
      name: 'Magic Resistance',
      actionType: 'passive',
      actions: null,
      category: 'defensive',
      description: 'The creature has a +1 status bonus to all saving throws against magical effects.',
    };
  }

  if (/^pack tactics$/i.test(name)) {
    return {
      name: 'Pack Attack',
      actionType: 'passive',
      actions: null,
      category: 'offensive',
      description: `The creature's Strikes deal ${packAttackDice(level)} extra damage to creatures `
        + "within reach of at least two of the creature's allies.",
    };
  }

  if (/^keen (?:hearing and smell|smell(?: and hearing)?)$/i.test(name)) {
    // PF2e models this as a sense, not a bonus; the trait itself disappears.
    return { drop: true, senses: [{ type: 'scent', acuity: 'imprecise', range: 30 }] };
  }

  if (/^sunlight (?:sensitivity|hypersensitivity)$/i.test(name)) {
    return {
      name: 'Light Blindness',
      actionType: 'passive',
      actions: null,
      category: 'defensive',
      description: 'When first exposed to bright light, the creature is blinded until the end of '
        + 'its next turn. After that, it is dazzled as long as it remains in the light.',
    };
  }

  if (/^undead fortitude$/i.test(name)) {
    return {
      name: 'Deathless Fortitude',
      actionType: 'passive',
      actions: null,
      category: 'defensive',
      description: 'When damage would reduce the creature to 0 Hit Points, it attempts a DC 15 '
        + 'flat check (DC 18 on a critical hit). On a success it is instead reduced to 1 Hit '
        + 'Point. This does not apply to vitality damage or critical hits to the head.',
    };
  }

  // "The creature's weapon attacks are magical" regulates a resistance system
  // the import already resolved into typed resistances; nothing to carry.
  if (/^magic weapons$/i.test(name) || /weapon attacks are magical\.?$/i.test(text)) {
    return { drop: true };
  }

  return null;
}

/**
 * Source-game grammar -> PF2e grammar inside prose. Applied to every carried
 * ability description after the DC rewrites.
 */
export function translateMechanicsText(text) {
  let result = String(text ?? '');

  // Advantage is worth about +4 on d20 but PF2e's vocabulary caps typed
  // bonuses lower; +2 circumstance is the printed idiom for this strong an
  // edge, and -2 its mirror.
  result = result.replace(/\bha(?:s|ve) advantage on\b/gi, 'gains a +2 circumstance bonus on');
  result = result.replace(/\bha(?:s|ve) disadvantage on\b/gi, 'takes a -2 circumstance penalty on');
  result = result.replace(/\bwith advantage\b/gi, 'with a +2 circumstance bonus');
  result = result.replace(/\bwith disadvantage\b/gi, 'with a -2 circumstance penalty');
  result = result.replace(/\bhit points?\b/gi, 'Hit Points');
  return result;
}

/**
 * A "(Recharge 5-6)" tag on an ability name becomes a cooldown sentence in
 * PF2e's wording. Returns the cleaned name and the sentence to append, or
 * null when the name carries no recharge.
 */
export function translateRecharge(name) {
  const match = name.match(/\s*\(recharge\s*(\d)(?:\s*[-–]\s*6)?\)/i);
  if (!match) return null;
  const dice = RECHARGE_ROUNDS[Number(match[1])] ?? '1d4';
  return {
    name: name.replace(match[0], '').trim(),
    sentence: ` The creature can't use this ability again for ${dice} rounds.`,
  };
}

/**
 * Legendary and mythic actions happen on other creatures' turns; PF2e's only
 * out-of-turn tool is the reaction, so that is what they become, with the
 * standard trigger stated. Lair actions instead belong to the place and stay
 * free actions annotated as such by the section mapping.
 */
export function legendaryTriggerPrefix(description) {
  if (/^\s*trigger/i.test(description)) return description;
  return `Trigger The end of another creature's turn. Effect ${description}`;
}
