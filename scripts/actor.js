/**
 * Turn a creature spec into a pf2e NPC actor.
 *
 * `actorDataFromSpec` is pure and fully covered by check-actor.mjs; the
 * only Foundry calls live in `createCreatureActor` and `applyArtwork`.
 *
 * Verified against pf2e's own data models: NPC skills are embedded `lore`
 * items keyed by `system.mod.value`; strikes are `melee` items with a
 * `damageRolls` record and a nullable `range` schema (not range traits, which
 * are legacy); abilities are `action` items with `actionType`/`actions`.
 */
import { MODULE_ID } from './constants.js';
import { attachSpellcasting } from './spells.js';
import { attachGear } from './equipment.js';

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const paragraphs = (text) => String(text ?? '')
  .split(/\n{2,}/)
  .map((p) => `<p>${escapeHTML(p.trim())}</p>`)
  .join('');

let strikeKeyCounter = 0;
/** Stable-per-call unique keys for damageRolls records. */
const strikeKey = () => `mcc${(strikeKeyCounter += 1).toString(36).padStart(9, '0')}`;

const ACTION_IMG = {
  passive: 'systems/pf2e/icons/actions/Passive.webp',
  action: 'systems/pf2e/icons/actions/OneAction.webp',
  reaction: 'systems/pf2e/icons/actions/Reaction.webp',
  free: 'systems/pf2e/icons/actions/FreeAction.webp',
};

export function actorDataFromSpec(spec) {
  const items = [];

  for (const strike of spec.strikes) {
    const damageRolls = {
      [strikeKey()]: { damage: strike.damage, damageType: strike.damageType, category: null },
    };
    for (const extra of strike.extra ?? []) {
      damageRolls[strikeKey()] = { damage: extra.dice, damageType: extra.type, category: null };
    }
    items.push({
      name: strike.name,
      type: 'melee',
      img: 'systems/pf2e/icons/default-icons/melee.svg',
      system: {
        bonus: { value: strike.bonus },
        damageRolls,
        traits: { value: strike.traits ?? [] },
        attackEffects: { value: strike.attackEffects ?? [] },
        range: strike.rangeIncrement
          ? { increment: strike.rangeIncrement, max: strike.rangeMax ?? null }
          : null,
        description: { value: '' },
      },
    });
  }

  for (const special of spec.specials ?? []) {
    // Dropped items are cloned wholesale after creation, so they are not
    // rebuilt as actions here.
    if (special.uuid) continue;
    items.push({
      name: special.name,
      type: 'action',
      img: ACTION_IMG[special.actionType] ?? ACTION_IMG.passive,
      system: {
        actionType: { value: special.actionType },
        actions: { value: special.actionType === 'action' ? special.actions ?? 1 : null },
        category: special.category ?? null,
        description: { value: paragraphs(special.description) },
        // Limited-use abilities (Legendary Resistance 3/day) carry a real
        // frequency so the sheet tracks the uses.
        ...(special.frequency
          ? { frequency: { value: special.frequency.max, max: special.frequency.max, per: special.frequency.per } }
          : {}),
      },
    });
  }

  // Real spellcasting entries (attached after creation) carry DC, attack and
  // the spells themselves; the prose note only exists for a creature whose
  // abilities reference a DC without any parseable spell list.
  if (spec.spell && !spec.spellcasting?.entries?.length) {
    items.push({
      name: 'Spellcasting',
      type: 'action',
      img: ACTION_IMG.passive,
      system: {
        actionType: { value: 'passive' },
        actions: { value: null },
        category: 'offensive',
        description: {
          value: `<p>Spell DC ${spec.spell.dc}, spell attack ${signed(spec.spell.attack)}. `
            + 'Add spells to taste; no spell list was found to convert.</p>',
        },
      },
    });
  }

  const notes = [
    spec.description ? paragraphs(spec.description) : '',
    spec.sourceNote ? `<p><em>${escapeHTML(spec.sourceNote)}</em></p>` : '',
  ].join('');

  return {
    name: spec.name,
    type: 'npc',
    img: 'systems/pf2e/icons/default-icons/npc.svg',
    system: {
      /*
       * Skills live on the actor, not in items.
       *
       * This was wrong for a long time: the module emitted one `lore` item
       * per skill, which renders a plausible-looking number on the sheet but
       * registers under `athletics-lore`, leaving the real `athletics`
       * statistic untrained and worth only the Strength modifier. Every
       * Grapple, Trip, @Check link and skill macro then rolled ~10 points
       * low. Verified against pathfinder-monster-core: 492 of 492 NPCs store
       * `system.skills.<slug>.base`, and every `lore` item in the pack is a
       * genuine Lore subject ("Boneyard Lore"), never a core skill.
       */
      skills: Object.fromEntries(
        (spec.skills ?? []).map((skill) => [skill.slug, { base: skill.mod }]),
      ),
      abilities: Object.fromEntries(
        Object.entries(spec.abilities).map(([key, mod]) => [key, { mod }]),
      ),
      attributes: {
        ac: { value: spec.ac.value, details: '' },
        hp: { value: spec.hp.value, max: spec.hp.value, temp: 0, details: '' },
        speed: {
          value: spec.speeds.land,
          otherSpeeds: spec.speeds.others.map((s) => ({ type: s.type, value: s.value })),
          details: '',
        },
        immunities: (spec.immunities ?? []).map((type) => ({ type })),
        resistances: (spec.resistances ?? []).map(({ type, value }) => ({ type, value })),
        weaknesses: (spec.weaknesses ?? []).map(({ type, value }) => ({ type, value })),
      },
      perception: {
        mod: spec.perception.mod,
        senses: (spec.senses ?? []).map((s) => ({
          type: s.type,
          acuity: s.acuity,
          ...(s.range ? { range: s.range } : {}),
        })),
        details: '',
        vision: true,
      },
      saves: {
        fortitude: { value: spec.saves.fortitude.value, saveDetail: '' },
        reflex: { value: spec.saves.reflex.value, saveDetail: '' },
        will: { value: spec.saves.will.value, saveDetail: '' },
      },
      details: {
        level: { value: spec.level },
        languages: { value: spec.languages ?? [], details: spec.languageDetails ?? '' },
        blurb: '',
        publicNotes: notes,
        privateNotes: '',
      },
      traits: {
        value: spec.traits ?? [],
        rarity: spec.rarity ?? 'common',
        size: { value: spec.size },
      },
    },
    items,
  };
}

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Create the actor, then realise its spellcasting from the compendium. */
export async function createCreatureActor(spec, { signal } = {}) {
  const data = actorDataFromSpec(spec);
  const actor = await Actor.implementation.create(data);
  if (!actor) throw new Error(game.i18n.localize('MCC.Errors.ActorCreateFailed'));

  // Resolving compendia can take seconds on a cold pack, which is exactly
  // when a GM reaches for Cancel; check between steps rather than pretending
  // the button works.
  const stop = () => {
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
  };

  const { created, missing } = await attachSpellcasting(actor, spec);
  stop();
  const gear = await attachGear(actor, spec);
  stop();
  await attachDroppedSpecials(actor, spec);
  if (missing.length) {
    // The GM gets the unmatched names on the sheet itself, where the creature
    // is actually used - a toast alone would be gone by game night.
    await actor.createEmbeddedDocuments('Item', [{
      name: game.i18n.localize('MCC.Create.UnmatchedSpellsTitle'),
      type: 'action',
      img: ACTION_IMG.passive,
      system: {
        actionType: { value: 'passive' },
        actions: { value: null },
        category: 'offensive',
        description: {
          value: `<p>${game.i18n.localize('MCC.Create.UnmatchedSpellsBody')}</p>`
            + `<p><strong>${missing.map(escapeHTML).join(', ')}</strong></p>`,
        },
      },
    }]);
    ui.notifications.warn(
      game.i18n.format('MCC.Create.SpellsMissing', { count: missing.length, list: missing.join(', ') }),
    );
  }

  if (gear.missing.length) {
    // Gear is cosmetic, so an unmatched name is a console note and a toast,
    // not an item on the sheet - the Strike it came from already works.
    console.warn(`${MODULE_ID} | no compendium match for gear: ${gear.missing.join(', ')}`);
    ui.notifications.info(
      game.i18n.format('MCC.Create.GearMissing', { list: gear.missing.join(', ') }),
    );
  }

  console.log(
    `${MODULE_ID} | created actor ${actor.name} (${actor.id}), `
    + `${created} spells and ${gear.created} items attached`,
  );
  return actor;
}

/**
 * Abilities the GM dragged in are cloned as the documents they are - rules
 * elements, images and all - rather than flattened into a text action.
 */
export async function attachDroppedSpecials(actor, spec, { resolveUuid } = {}) {
  const dropped = (spec.specials ?? []).filter((special) => special.uuid);
  if (dropped.length === 0) return { created: 0, missing: [] };

  const byUuid = resolveUuid ?? (typeof fromUuid === 'function' ? fromUuid : null);
  const sources = [];
  const missing = [];
  for (const special of dropped) {
    const doc = byUuid ? await byUuid(special.uuid) : null;
    const base = doc?.toObject ? doc.toObject() : doc;
    if (!base) {
      missing.push(special.name);
      continue;
    }
    delete base._id;
    delete base.folder;
    sources.push(base);
  }
  if (sources.length) await actor.createEmbeddedDocuments('Item', sources);
  return { created: sources.length, missing };
}

/** Point both the portrait and the prototype token at a saved image. */
export async function applyArtwork(actor, path) {
  await actor.update({
    img: path,
    'prototypeToken.texture.src': path,
  });
}
