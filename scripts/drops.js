/**
 * Drag-and-drop plumbing for the builder.
 *
 * ApplicationV2 has no drag-drop support of its own - no `dragDrop` option,
 * no callbacks - so the view wires listeners by hand and calls in here. This
 * module owns everything that can be reasoned about without a DOM: what a
 * drop event carries, which bucket an item belongs in, and what a dropped
 * item contributes to a draft.
 */

/** Where each droppable pf2e item type goes in the builder. */
const BUCKETS = {
  spell: 'spells',
  action: 'specials',
  feat: 'specials',
  weapon: 'gear',
  armor: 'gear',
  shield: 'gear',
  equipment: 'gear',
  consumable: 'gear',
  treasure: 'gear',
  backpack: 'gear',
  melee: 'strikes',
};

export function bucketFor(type) {
  return BUCKETS[type] ?? null;
}

export const ACCEPTED_TYPES = Object.keys(BUCKETS);

/**
 * Parse a drop event's payload. Foundry puts JSON on `text/plain`; anything
 * else on the clipboard is somebody else's drag and is ignored quietly.
 */
export function readDropData(event) {
  const raw = event?.dataTransfer?.getData('text/plain');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Reduce a dropped item document to what the draft stores: enough to show a
 * row, plus the uuid so creation clones the real document rather than a
 * reconstruction of it.
 */
export function describeDropped(item) {
  const type = item?.type;
  const bucket = bucketFor(type);
  if (!bucket) return null;

  const entry = {
    bucket,
    uuid: item.uuid ?? null,
    name: item.name ?? 'Item',
    img: item.img ?? null,
    type,
  };

  if (type === 'spell') {
    const rank = Number(item.system?.level?.value) || 0;
    entry.rank = rank;
    entry.cantrip = Boolean(item.system?.traits?.value?.includes('cantrip'));
    // Frequency is the GM's call; default to the most common NPC case.
    entry.uses = null;
    entry.atWill = entry.cantrip;
    entry.constant = false;
  }
  if (type === 'melee') {
    entry.bonus = Number(item.system?.bonus?.value) || 0;
  }
  return entry;
}

/**
 * A dropped action or feat becomes a special with its own text. Feats carry
 * no actionType, so they land as passive - which is what a feat dragged onto
 * a monster usually means.
 */
export function droppedToSpecial(entry, item) {
  const actionType = item?.system?.actionType?.value ?? 'passive';
  const actions = item?.system?.actions?.value ?? null;
  return {
    name: entry.name,
    uuid: entry.uuid,
    section: 'trait',
    actionType: ['action', 'reaction', 'free', 'passive'].includes(actionType) ? actionType : 'passive',
    actions,
    category: item?.system?.category ?? null,
    description: item?.system?.description?.value ?? '',
  };
}

/** Add an entry to a draft's drop lists, ignoring exact duplicates. */
export function addDrop(draft, entry) {
  const list = draft.drops[entry.bucket];
  if (!list) return false;
  if (entry.uuid && list.some((existing) => existing.uuid === entry.uuid)) return false;
  list.push(entry);
  return true;
}
