/**
 * Gear: the weapons, armour and shields a creature carries, resolved from the
 * pf2e equipment compendium and added to its inventory.
 *
 * The Building Creatures guidance is explicit that a creature's statistics
 * already account for its gear - the tables set AC, attack and damage, and
 * the items listed beside them are descriptive. This module honours that
 * literally: nothing here touches a number. An imported creature's AC comes
 * from the AC table whether it wears chain mail or nothing at all, and its
 * Strikes are `melee` items built by convert.js, independent of the weapon
 * sitting in the inventory. Adding a battleaxe makes the sheet say what the
 * creature is holding; it does not restat the axe.
 *
 * Storage follows official bestiary data (verified against the
 * pathfinder-monster-core pack): weapons and shields are `held` with one
 * hand, armour is `worn` and in its slot.
 */

const EQUIPMENT_PACK = 'pf2e.equipment-srd';

/** Natural weaponry: a body part, never an inventory item. */
const NATURAL_ATTACKS = new RegExp(
  '^(bite|claw|claws|slam|tail|tentacle|tentacles|sting|gore|hoof|hooves|talon|talons|'
  + 'fist|pincer|pseudopod|horn|beak|wing|tongue|spine|spines|quill|quills|stomp|'
  + 'trample|constrict|rend|touch|ram|maw|jaws|fangs|proboscis|barb|hook|breath|spit|'
  + 'spray|gaze|web|ray|blast)\\b',
  'i',
);

/**
 * Source-game gear names -> the pf2e compendium's names. Only entries whose
 * spelling actually differs need to be here; anything else matches directly
 * and is validated by check-equipment.mjs.
 */
export const GEAR_MAP = {
  battleaxe: 'battle axe',
  handaxe: 'hatchet',
  quarterstaff: 'staff',
  'light crossbow': 'crossbow',
  'hand crossbow': 'hand crossbow',
  'short sword': 'shortsword',
  shortsword: 'shortsword',
  'studded leather': 'studded leather armor',
  leather: 'leather armor',
  hide: 'hide armor',
  'ring mail': 'chain mail',
  'scale mail': 'scale mail',
  'chain shirt': 'chain shirt',
  'splint armor': 'splint mail',
  splint: 'splint mail',
  plate: 'full plate',
  'plate armor': 'full plate',
  'plate mail': 'full plate',
  'half plate': 'half plate',
  shield: 'steel shield',
  'wooden shield': 'wooden shield',
  greatclub: 'greatclub',
  maul: 'maul',
  morningstar: 'morningstar',
  sickle: 'sickle',
  scimitar: 'scimitar',
  'war pick': 'pick',
};

/** Things that are not gear even though they appear in an AC parenthetical. */
const NOT_GEAR = /^(natural armor|natural|armor|unarmored defense|mage armor|barkskin|with shield|see below|none|\d+)$/i;

export function normaliseGearName(raw) {
  const name = String(raw)
    .toLowerCase()
    .replace(/\+\d+\s*/g, '')
    .replace(/\b(a|an|the)\b/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, (s, i, whole) => (whole.endsWith('ss') ? s : ''));
  if (!name || NOT_GEAR.test(name)) return null;
  return GEAR_MAP[name] ?? name;
}

/**
 * Everything the creature visibly carries, from three places: the AC
 * parenthetical ("Armor Class 18 (chain mail, shield)"), the 2024 layout's
 * Gear line, and the names of Strikes that are weapons rather than body
 * parts. Deduplicated, order stable.
 */
export function gearFromParsed(data) {
  const found = [];
  const add = (raw) => {
    const name = normaliseGearName(raw);
    if (name && !found.includes(name)) found.push(name);
  };

  /*
   * The AC parenthetical means different things in different systems: 5e
   * writes what the creature is wearing ("chain mail, shield"), PF1e writes
   * the arithmetic ("+7 natural, +3 Dex"). A bonus figure is the tell, and
   * reading one as gear armed creatures with a "Dex".
   */
  const acNote = data.acNote ?? '';
  if (!/[+-]\d/.test(acNote)) {
    for (const part of acNote.split(/,|\band\b/)) add(part);
  }
  for (const part of (data.gearLine ?? '').split(/,|\band\b/)) add(part);
  for (const attack of data.attacks ?? []) {
    if (NATURAL_ATTACKS.test(attack.name)) continue;
    // "Longsword (two-handed)" and "Greataxe +1" both name one weapon.
    add(attack.name);
  }
  return found;
}

/** A finder backed by the equipment compendium: name -> source or null. */
export async function compendiumGearFinder() {
  const pack = game.packs.get(EQUIPMENT_PACK);
  if (!pack) return null;
  const index = await pack.getIndex({ fields: ['type', 'system.slug'] });
  return async (name) => {
    const wanted = String(name).toLowerCase();
    const hit = index.find((e) => e.name.toLowerCase() === wanted)
      ?? index.find((e) => e.system?.slug === wanted.replace(/[^a-z0-9]+/g, '-'));
    if (!hit) return null;
    const doc = await pack.getDocument(hit._id);
    return doc?.toObject() ?? null;
  };
}

/**
 * How a piece of gear is carried.
 *
 * `handsHeld` must match what the item's usage demands: pf2e's `isEquipped`
 * compares it against `usage.hands`, so a maul or greatsword recorded as
 * held in one hand reports itself unequipped. Real bestiary data agrees -
 * the Ogre Warrior's Ogre Hook is stored with `handsHeld: 2`. Anything that
 * is not held at all (a potion, a cloak) is worn or stowed, not gripped.
 */
const HELD_TYPES = new Set(['weapon', 'shield']);

export function equippedState(type, usage) {
  if (type === 'armor') return { carryType: 'worn', handsHeld: 0, inSlot: true, invested: null };
  if (!HELD_TYPES.has(type)) return { carryType: 'worn', handsHeld: 0, invested: null };
  const hands = usage?.value === 'held-in-two-hands' ? 2 : 1;
  return { carryType: 'held', handsHeld: hands, invested: null };
}

/** A compendium source made ready to embed on the creature. */
export function gearSource(base) {
  const source = structuredClone(base);
  delete source._id;
  delete source.folder;
  source.system.quantity = 1;
  source.system.equipped = equippedState(source.type, source.system?.usage);
  return source;
}

/**
 * Add the spec's gear to an existing actor. Returns what happened so the
 * caller can tell the GM which names went unmatched, exactly as the spell
 * path does.
 */
export async function attachGear(actor, spec, { findGear, resolveUuid } = {}) {
  // Entries are {name, uuid}; a bare string is accepted from callers that
  // only know a name.
  const wanted = (spec.equipment ?? []).map((e) => (typeof e === 'string' ? { name: e, uuid: null } : e));
  if (wanted.length === 0) return { created: 0, missing: [] };

  const finder = findGear ?? await compendiumGearFinder();
  const byUuid = resolveUuid ?? (typeof fromUuid === 'function' ? fromUuid : null);
  const sources = [];
  const missing = [];
  for (const entry of wanted) {
    // A dropped item is already the document the GM chose, so clone that
    // rather than looking its name up again and risking a different printing.
    let base = null;
    if (entry.uuid && byUuid) {
      const doc = await byUuid(entry.uuid);
      base = doc?.toObject ? doc.toObject() : doc;
    }
    if (!base) base = finder ? await finder(entry.name) : null;
    if (!base) {
      missing.push(entry.name);
      continue;
    }
    sources.push(gearSource(base));
  }
  if (sources.length) await actor.createEmbeddedDocuments('Item', sources);
  return { created: sources.length, missing };
}
