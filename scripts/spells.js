/**
 * Realise a spec's spellcasting as real documents: a spellcastingEntry item
 * per entry and actual spell items resolved from the pf2e spells compendium,
 * so the creature's Spells tab is populated and castable rather than a prose
 * note.
 *
 * The storage conventions follow what pf2e's own bestiary data does (verified
 * against the pathfinder-monster-core pack): per-day innate spells carry
 * `system.location.uses {value, max}`; at-will leveled spells are suffixed
 * "(At Will)" with no uses; constant ones "(Constant)"; cantrips need
 * neither. Spontaneous entries carry their slot counts on the entry.
 *
 * A name the compendium does not know is reported, never guessed: the caller
 * lists it on the sheet for the GM instead of inventing a document.
 */

const SPELLS_PACK = 'pf2e.spells-srd';

/** The slug the pf2e compendium uses for a spell name. */
export function spellSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[''’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A finder backed by the world's spells compendium: name -> spell source or
 * null. Slug match first, plain name second.
 */
export async function compendiumSpellFinder() {
  const pack = game.packs.get(SPELLS_PACK);
  if (!pack) return null;
  const index = await pack.getIndex({ fields: ['system.slug'] });
  return async (name) => {
    const slug = spellSlug(name);
    const hit = index.find((e) => e.system?.slug === slug)
      ?? index.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
    if (!hit) return null;
    const doc = await pack.getDocument(hit._id);
    return doc?.toObject() ?? null;
  };
}

/** The spellcastingEntry item source for one spec entry. */
export function entrySource(entry) {
  const slots = {};
  if (entry.category === 'spontaneous') {
    for (const [rank, count] of Object.entries(entry.slots ?? {})) {
      slots[`slot${rank}`] = { value: count, max: count, prepared: [] };
    }
  }
  return {
    name: entry.name,
    type: 'spellcastingEntry',
    img: 'systems/pf2e/icons/default-icons/spellcastingEntry.svg',
    system: {
      ability: { value: entry.ability || 'cha' },
      spelldc: { value: entry.attack, dc: entry.dc },
      tradition: { value: entry.tradition },
      prepared: { value: entry.category },
      showSlotlessLevels: { value: false },
      ...(Object.keys(slots).length ? { slots } : {}),
    },
  };
}

/** A compendium spell source filed under an entry, uses and suffixes applied. */
export function spellSource(base, entryId, spell) {
  const source = structuredClone(base);
  delete source._id;
  delete source.folder;
  const isCantrip = source.system?.traits?.value?.includes('cantrip') ?? false;
  source.system.location = { value: entryId };
  if (spell.uses && !isCantrip) {
    source.system.location.uses = { value: spell.uses, max: spell.uses };
  }
  if (spell.constant) source.name = `${source.name} (Constant)`;
  else if (spell.atWill && !isCantrip) source.name = `${source.name} (At Will)`;
  return source;
}

/** The rank a spell occupies: cantrips sit at 0, everything else at its own. */
export function rankOf(source) {
  if (source?.system?.traits?.value?.includes('cantrip')) return 0;
  return Math.min(Math.max(Number(source?.system?.level?.value) || 1, 1), 10);
}

/**
 * Slots for an entry, counted from the spells that actually resolved.
 *
 * The two categories store slots differently, and getting it wrong is what
 * produced a sheet full of "Empty Slot (drag spell here)": a **prepared**
 * caster's slots name the spell items prepared into them, by id, while a
 * **spontaneous** caster's slots are only counts, its spells forming a
 * repertoire. Verified against prepared and spontaneous entries in the
 * pathfinder-monster-core pack.
 *
 * @param created The spell documents as the actor created them, ids and all.
 */
export function slotsForSpells(created, category) {
  const slots = {};
  for (const spell of created) {
    const id = spell._id ?? spell.id;
    const key = `slot${rankOf(spell)}`;
    const slot = slots[key] ?? (slots[key] = { max: 0, prepared: [] });
    slot.max += 1;
    if (id) slot.prepared.push({ id });
  }

  for (const [key, slot] of Object.entries(slots)) {
    if (category === 'prepared') {
      // Cantrips are always available; the rank-0 row is a list, not a budget.
      slots[key] = key === 'slot0'
        ? { max: slot.max, prepared: slot.prepared }
        : { max: slot.max, value: slot.max, prepared: slot.prepared };
    } else {
      slots[key] = { max: slot.max, value: slot.max, prepared: [] };
    }
  }
  return slots;
}

/**
 * Create the entries and their spells on an existing actor.
 *
 * Two passes per entry because a spell must name its entry's real id. Returns
 * what happened so the caller can put unmatched names in front of the GM.
 */
export async function attachSpellcasting(actor, spec, { findSpell, resolveUuid } = {}) {
  const entries = spec.spellcasting?.entries ?? [];
  if (entries.length === 0) return { created: 0, missing: [] };

  const finder = findSpell ?? await compendiumSpellFinder();
  const byUuid = resolveUuid ?? (typeof fromUuid === 'function' ? fromUuid : null);
  const missing = [];
  let created = 0;

  for (const entry of entries) {
    const [entryDoc] = await actor.createEmbeddedDocuments('Item', [entrySource(entry)]);
    const entryId = entryDoc._id ?? entryDoc.id;
    const sources = [];
    for (const spell of entry.spells) {
      // A spell the GM dragged in is already the document they chose.
      let base = null;
      if (spell.uuid && byUuid) {
        const doc = await byUuid(spell.uuid);
        base = doc?.toObject ? doc.toObject() : doc;
      }
      if (!base) base = finder ? await finder(spell.name) : null;
      if (!base) {
        missing.push(spell.name);
        continue;
      }
      sources.push(spellSource(base, entryId, spell));
    }
    if (sources.length) {
      const madeSpells = await actor.createEmbeddedDocuments('Item', sources);
      created += sources.length;
      // A prepared or spontaneous entry needs its slots, and they can only be
      // filled once the spells exist: a prepared slot names the spell item
      // in it, so this has to happen after creation, not before.
      if (entry.slotsFromSpells) {
        await actor.updateEmbeddedDocuments('Item', [{
          _id: entryId,
          system: { slots: slotsForSpells(madeSpells ?? [], entry.category) },
        }]);
      }
    }
  }
  return { created, missing };
}
