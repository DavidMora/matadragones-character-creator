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
        attackEffects: { value: [] },
        range: strike.rangeIncrement
          ? { increment: strike.rangeIncrement, max: strike.rangeMax ?? null }
          : null,
        description: { value: '' },
      },
    });
  }

  for (const skill of spec.skills) {
    items.push({
      name: skill.name,
      type: 'lore',
      img: 'systems/pf2e/icons/default-icons/lore.svg',
      system: { mod: { value: skill.mod }, description: { value: '' } },
    });
  }

  for (const special of spec.specials ?? []) {
    items.push({
      name: special.name,
      type: 'action',
      img: ACTION_IMG[special.actionType] ?? ACTION_IMG.passive,
      system: {
        actionType: { value: special.actionType },
        actions: { value: special.actionType === 'action' ? special.actions ?? 1 : null },
        category: special.category ?? null,
        description: { value: paragraphs(special.description) },
      },
    });
  }

  if (spec.spell) {
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
            + 'Add spells to taste; slots and lists do not convert mechanically.</p>',
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
        languages: { value: spec.languages ?? [], details: '' },
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

/** Create the actor in the world and return it. */
export async function createCreatureActor(spec) {
  const data = actorDataFromSpec(spec);
  const actor = await Actor.implementation.create(data);
  if (!actor) throw new Error(game.i18n.localize('MCC.Errors.ActorCreateFailed'));
  console.log(`${MODULE_ID} | created actor ${actor.name} (${actor.id})`);
  return actor;
}

/** Point both the portrait and the prototype token at a saved image. */
export async function applyArtwork(actor, path) {
  await actor.update({
    img: path,
    'prototypeToken.texture.src': path,
  });
}
