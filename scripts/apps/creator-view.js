import {
  DAMAGE_TYPES,
  MODULE_ID,
  PF2E_SKILLS,
  RARITIES,
  SETTINGS,
  SIZES,
} from '../constants.js';
import { LEVELS, ROAD_MAPS, TIERS } from '../tables.js';
import { parse5eStatBlock } from '../parse5e.js';
import { levelFromCR } from '../baseline5e.js';
import {
  classify,
  convertCreature,
  seedFromRoadMap,
  specFromBuilder,
} from '../convert.js';
import { createCreatureActor, applyArtwork } from '../actor.js';
import { activeModel, hasApiKey } from '../ai/openai.js';
import { generateImage, saveImage } from '../ai/image.js';
import { aiParseStatBlock, aiRewriteAbilities, portraitPrompt } from '../ai/assist.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The one window. Two tabs share a preview: Import turns a pasted 5e stat
 * block into a spec, Builder assembles one from a road map. Both create the
 * same kind of pf2e NPC through the same code.
 *
 * All state lives on the instance and inputs write into it via `data-bind`
 * on change, so a re-render (which tier changes need, to refresh the computed
 * numbers) never loses what the GM typed.
 */
export class CreatorView extends HandlebarsApplicationMixin(ApplicationV2) {
  #tab = 'import';
  #importText = '';
  #parsed = null;
  #parseMissing = [];
  #parsedVia = null; // 'text' | 'ai'
  #importLevel = null;
  #importTiers = {};
  #builder = null;
  #busy = null; // null | 'parse' | 'rewrite' | 'create' | 'artwork'
  #abort = null;

  constructor(options = {}) {
    super(options);
    this.#builder = { ...seedFromRoadMap('balanced', 3), name: '', size: 'med', rarity: 'common', traits: [], speed: 25, description: '', strikes: [{ name: 'Fist', kind: 'melee', damageType: 'bludgeoning' }], skills: [] };
  }

  static DEFAULT_OPTIONS = {
    id: 'mcc-creator',
    classes: ['mcc'],
    window: {
      title: 'MCC.View.Title',
      icon: 'fa-solid fa-dragon',
      resizable: true,
    },
    position: { width: 860, height: 720 },
    actions: {
      switchTab: CreatorView.#onSwitchTab,
      parse: CreatorView.#onParse,
      aiParse: CreatorView.#onAiParse,
      rewrite: CreatorView.#onRewrite,
      createImport: CreatorView.#onCreateImport,
      createBuilder: CreatorView.#onCreateBuilder,
      addStrike: CreatorView.#onAddStrike,
      removeStrike: CreatorView.#onRemoveStrike,
      addSkill: CreatorView.#onAddSkill,
      removeSkill: CreatorView.#onRemoveSkill,
      cancel: CreatorView.#onCancel,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/creator-view.hbs` },
  };

  static open() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize('MCC.Errors.GMOnly'));
      return null;
    }
    const existing = foundry.applications.instances.get('mcc-creator');
    if (existing) return existing.render({ force: true });
    return new CreatorView().render({ force: true });
  }

  // --- Context --------------------------------------------------------------

  async _prepareContext() {
    const tierOptions = (current, allowed = TIERS) => allowed.map((value) => ({
      value,
      label: game.i18n.localize(`MCC.Tier.${value}`),
      selected: value === current,
    }));
    const levelOptions = (current) => LEVELS.map((value) => ({
      value, selected: value === current,
    }));

    const context = {
      busy: this.#busy,
      busyParse: this.#busy === 'parse',
      busyCreate: this.#busy === 'create' || this.#busy === 'artwork',
      busyArtwork: this.#busy === 'artwork',
      busyRewrite: this.#busy === 'rewrite',
      hasApiKey: hasApiKey(),
      model: activeModel(),
      isImport: this.#tab === 'import',
      isBuilder: this.#tab === 'builder',
    };

    // Import tab
    context.importText = this.#importText;
    context.parseMissing = this.#parseMissing;
    context.parsedVia = this.#parsedVia;
    if (this.#parsed) {
      const spec = this.#importSpec();
      const defaults = classify(this.#parsed);
      context.parsed = {
        name: this.#parsed.name,
        crText: this.#parsed.crText || String(this.#parsed.cr ?? '?'),
        type: [this.#parsed.size, this.#parsed.type].filter(Boolean).join(' '),
        specialCount: this.#parsed.specials.length,
        attackCount: this.#parsed.attacks.length,
      };
      context.importLevels = levelOptions(spec.level);
      context.importTiers = this.#tierRows(spec, defaults);
      context.importSpec = this.#specContext(spec);
    }

    // Builder tab
    const draft = this.#builder;
    const builderSpec = specFromBuilder(draft);
    context.builder = {
      name: draft.name,
      level: levelOptions(draft.level),
      speed: draft.speed,
      description: draft.description,
      traits: (draft.traits ?? []).join(', '),
      roadMaps: Object.entries(ROAD_MAPS).map(([value, map]) => ({
        value,
        label: game.i18n.localize(map.label),
        selected: value === draft.roadMap,
      })),
      sizes: Object.entries(SIZES).map(([value, label]) => ({
        value, label: game.i18n.localize(label), selected: value === draft.size,
      })),
      rarities: Object.entries(RARITIES).map(([value, label]) => ({
        value, label: game.i18n.localize(label), selected: value === draft.rarity,
      })),
      tiers: [
        { key: 'perception', label: 'MCC.Stat.Perception', options: tierOptions(draft.perception), value: builderSpec.perception.mod, signed: true },
        { key: 'ac', label: 'MCC.Stat.AC', options: tierOptions(draft.ac, TIERS.slice(0, 4)), value: builderSpec.ac.value },
        { key: 'fortitude', label: 'MCC.Stat.Fort', options: tierOptions(draft.fortitude), value: builderSpec.saves.fortitude.value, signed: true },
        { key: 'reflex', label: 'MCC.Stat.Ref', options: tierOptions(draft.reflex), value: builderSpec.saves.reflex.value, signed: true },
        { key: 'will', label: 'MCC.Stat.Will', options: tierOptions(draft.will), value: builderSpec.saves.will.value, signed: true },
        { key: 'hp', label: 'MCC.Stat.HP', options: tierOptions(draft.hp, ['high', 'moderate', 'low']), value: builderSpec.hp.value },
        { key: 'attack', label: 'MCC.Stat.Attack', options: tierOptions(draft.attack, TIERS.slice(0, 4)), value: builderSpec.strikes[0]?.bonus ?? '-', signed: true },
        { key: 'damage', label: 'MCC.Stat.Damage', options: tierOptions(draft.damage, TIERS.slice(0, 4)), value: builderSpec.strikes[0]?.damage ?? '-' },
        { key: 'spell', label: 'MCC.Stat.SpellDC', options: [{ value: '', label: game.i18n.localize('MCC.Tier.none'), selected: !draft.spell }, ...tierOptions(draft.spell, ['extreme', 'high', 'moderate'])], value: builderSpec.spell?.dc ?? '-' },
      ],
      abilities: Object.entries(draft.abilities).map(([key, tier]) => ({
        key,
        label: key.toUpperCase(),
        options: tierOptions(tier, TIERS.slice(0, 4)),
        value: builderSpec.abilities[key],
      })),
      strikes: (draft.strikes ?? []).map((strike, index) => ({
        index,
        name: strike.name,
        isRanged: strike.kind === 'ranged',
        damageTypes: DAMAGE_TYPES.map((value) => ({ value, selected: value === strike.damageType })),
      })),
      skills: (draft.skills ?? []).map((skill, index) => ({
        index,
        options: PF2E_SKILLS.map((value) => ({ value, selected: value === skill.slug })),
        tiers: tierOptions(skill.tier, ['extreme', 'high', 'moderate', 'low']),
      })),
    };
    context.builderSpec = this.#specContext(builderSpec);
    return context;
  }

  /** The import spec under the GM's current level and tier overrides. */
  #importSpec() {
    return convertCreature(this.#parsed, {
      level: this.#importLevel ?? levelFromCR(this.#parsed.cr),
      tiers: this.#importTiers,
    });
  }

  /** Tier select rows for the import preview, defaults marked. */
  #tierRows(spec, defaults) {
    const rows = [
      { key: 'perception', label: 'MCC.Stat.Perception', value: signed(spec.perception.mod), allowed: TIERS },
      { key: 'ac', label: 'MCC.Stat.AC', value: spec.ac.value, allowed: TIERS.slice(0, 4) },
      { key: 'fortitude', label: 'MCC.Stat.Fort', value: signed(spec.saves.fortitude.value), allowed: TIERS },
      { key: 'reflex', label: 'MCC.Stat.Ref', value: signed(spec.saves.reflex.value), allowed: TIERS },
      { key: 'will', label: 'MCC.Stat.Will', value: signed(spec.saves.will.value), allowed: TIERS },
      { key: 'hp', label: 'MCC.Stat.HP', value: spec.hp.value, allowed: ['high', 'moderate', 'low'] },
      { key: 'attack', label: 'MCC.Stat.Attack', value: signed(spec.strikes[0]?.bonus ?? 0), allowed: TIERS.slice(0, 4) },
      { key: 'damage', label: 'MCC.Stat.Damage', value: spec.strikes[0]?.damage ?? '-', allowed: TIERS.slice(0, 4) },
    ];
    return rows.map((row) => ({
      ...row,
      label: row.label,
      isDefault: !(row.key in this.#importTiers),
      options: row.allowed.map((value) => ({
        value,
        label: game.i18n.localize(`MCC.Tier.${value}`)
          + (value === defaults[row.key] ? ` ${game.i18n.localize('MCC.Import.DefaultMark')}` : ''),
        selected: value === (spec.tiers[row.key] ?? defaults[row.key]),
      })),
    }));
  }

  /** What the preview panel shows, shared by both tabs. */
  #specContext(spec) {
    return {
      name: spec.name,
      level: spec.level,
      traits: [spec.size, spec.rarity !== 'common' ? spec.rarity : null, ...spec.traits].filter(Boolean),
      perception: signed(spec.perception.mod),
      senses: spec.senses.map((s) => s.range ? `${s.type} ${s.range} ft.` : s.type).join(', '),
      abilities: Object.entries(spec.abilities).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${signed(v)}`).join(', '),
      ac: spec.ac.value,
      fort: signed(spec.saves.fortitude.value),
      ref: signed(spec.saves.reflex.value),
      will: signed(spec.saves.will.value),
      hp: spec.hp.value,
      immunities: spec.immunities.join(', '),
      resistances: spec.resistances.map((r) => `${r.type} ${r.value}`).join(', '),
      weaknesses: spec.weaknesses.map((w) => `${w.type} ${w.value}`).join(', '),
      speed: [
        `${spec.speeds.land} feet`,
        ...spec.speeds.others.map((s) => `${s.type} ${s.value} feet`),
      ].join(', '),
      strikes: spec.strikes.map((strike) => ({
        line: `${strike.kind === 'ranged' ? '\u{1F3F9}' : '⚔️'} ${strike.name} ${signed(strike.bonus)}, `
          + `${strike.damage} ${strike.damageType}`
          + strike.extra.map((e) => ` plus ${e.dice} ${e.type}`).join('')
          + (strike.traits.length ? ` (${strike.traits.join(', ')})` : ''),
      })),
      skills: spec.skills.map((skill) => `${skill.name} ${signed(skill.mod)}`).join(', '),
      spell: spec.spell ? game.i18n.format('MCC.Preview.SpellLine', { dc: spec.spell.dc, attack: signed(spec.spell.attack) }) : null,
      languages: spec.languages.join(', '),
      specials: spec.specials.map((s) => ({
        name: s.name,
        actionType: s.actionType,
        description: s.description.length > 240 ? `${s.description.slice(0, 240)}…` : s.description,
      })),
    };
  }

  // --- Input binding --------------------------------------------------------

  #changeBound = false;

  _onRender(context, options) {
    super._onRender?.(context, options);
    // The frame element survives re-renders, so bind the delegated listener
    // once - binding per render would fire the handler N times per change.
    if (this.#changeBound) return;
    this.#changeBound = true;
    this.element.addEventListener('change', (event) => this.#onFieldChange(event));
  }

  #onFieldChange(event) {
    const bind = event.target?.dataset?.bind;
    if (!bind) return;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    const [scope, ...path] = bind.split('.');

    if (scope === 'import') {
      if (path[0] === 'text') {
        this.#importText = value;
        return; // No re-render for typing; parse reads it on demand.
      }
      if (path[0] === 'level') this.#importLevel = Number(value);
      if (path[0] === 'tier') {
        // Selecting the classified default removes the override, so provenance
        // stays honest about what the GM changed.
        const defaults = classify(this.#parsed);
        if (value === defaults[path[1]]) delete this.#importTiers[path[1]];
        else this.#importTiers[path[1]] = value;
      }
      this.render();
      return;
    }

    if (scope !== 'builder') return;
    const draft = this.#builder;
    const key = path[0];
    if (key === 'roadMap') {
      // Re-seeding is the point of picking a road map; name and rows survive.
      const seeded = seedFromRoadMap(value, draft.level);
      Object.assign(draft, seeded);
    } else if (key === 'level') draft.level = Number(value);
    else if (key === 'speed') draft.speed = Number(value) || 25;
    else if (key === 'traits') {
      draft.traits = value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    } else if (key === 'ability') draft.abilities[path[1]] = value;
    else if (key === 'tier') draft[path[1]] = path[1] === 'spell' && value === '' ? null : value;
    else if (key === 'strike') {
      const strike = draft.strikes[Number(path[1])];
      if (!strike) return;
      if (path[2] === 'kind') strike.kind = value ? 'ranged' : 'melee';
      else strike[path[2]] = value;
    } else if (key === 'skill') {
      const skill = draft.skills[Number(path[1])];
      if (!skill) return;
      skill[path[2]] = value;
    } else draft[key] = value;

    // Change fires on blur for text fields, so re-rendering here never steals
    // focus mid-word; the description is the one field where it would flicker
    // for no visible gain.
    if (key !== 'description') this.render();
  }

  // --- Actions --------------------------------------------------------------

  static #onSwitchTab(_event, target) {
    this.#tab = target.dataset.tab === 'builder' ? 'builder' : 'import';
    this.render();
  }

  static #onParse() {
    this.#readImportText();
    const { ok, missing, data } = parse5eStatBlock(this.#importText);
    if (!data || (!ok && !data.name)) {
      ui.notifications.warn(game.i18n.localize('MCC.Import.NothingParsed'));
      return;
    }
    this.#parsed = data;
    this.#parseMissing = missing;
    this.#parsedVia = 'text';
    this.#importLevel = levelFromCR(data.cr);
    this.#importTiers = {};
    this.render();
  }

  static async #onAiParse() {
    this.#readImportText();
    if (!this.#importText.trim()) {
      ui.notifications.warn(game.i18n.localize('MCC.Import.NothingParsed'));
      return;
    }
    await this.#withBusy('parse', async (signal) => {
      const data = await aiParseStatBlock(this.#importText, { signal });
      this.#parsed = data;
      this.#parseMissing = [];
      this.#parsedVia = 'ai';
      this.#importLevel = levelFromCR(data.cr);
      this.#importTiers = {};
    });
  }

  static async #onRewrite() {
    if (!this.#parsed) return;
    await this.#withBusy('rewrite', async (signal) => {
      const spec = this.#importSpec();
      const rewritten = await aiRewriteAbilities(spec, { signal });
      // The rewrite lands back on the parsed specials so later tier changes
      // keep it: the spec is recomputed from #parsed on every render.
      const byName = new Map(rewritten.specials.map((s) => [s.name, s.description]));
      for (const special of this.#parsed.specials) {
        const clean = special.name.replace(/\s*\([^)]*\)\s*$/, '');
        if (byName.has(clean)) special.description = byName.get(clean);
      }
    });
  }

  static async #onCreateImport() {
    if (!this.#parsed) return;
    await this.#createFromSpec(this.#importSpec(), 'mcc-art-import');
  }

  static async #onCreateBuilder() {
    const spec = specFromBuilder(this.#builder);
    if (!this.#builder.name?.trim()) {
      ui.notifications.warn(game.i18n.localize('MCC.Builder.NameRequired'));
      return;
    }
    await this.#createFromSpec(spec, 'mcc-art-builder');
  }

  static #onAddStrike() {
    this.#builder.strikes.push({ name: '', kind: 'melee', damageType: 'slashing' });
    this.render();
  }

  static #onRemoveStrike(_event, target) {
    this.#builder.strikes.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onAddSkill() {
    this.#builder.skills.push({ slug: 'athletics', tier: 'moderate' });
    this.render();
  }

  static #onRemoveSkill(_event, target) {
    this.#builder.skills.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onCancel() {
    if (this.#busy) this.#abort?.abort();
    else this.close();
  }

  // --- Creation -------------------------------------------------------------

  /** Textareas only commit on blur; read the live value before acting. */
  #readImportText() {
    const field = this.element?.querySelector('[data-bind="import.text"]');
    if (field) this.#importText = field.value;
  }

  #wantArtwork(checkboxId) {
    const box = this.element?.querySelector(`#${checkboxId}`);
    return Boolean(box?.checked);
  }

  async #withBusy(kind, fn) {
    if (this.#busy) return;
    this.#busy = kind;
    this.#abort = new AbortController();
    this.render();
    try {
      await fn(this.#abort.signal);
    } catch (error) {
      if (error.name === 'AbortError') {
        ui.notifications.info(game.i18n.localize('MCC.Generate.Cancelled'));
      } else {
        console.error(`${MODULE_ID} | ${kind} failed`, error);
        ui.notifications.error(error.message, { permanent: true });
      }
    } finally {
      this.#busy = null;
      this.#abort = null;
      this.render();
    }
  }

  async #createFromSpec(spec, artCheckboxId) {
    const wantArt = this.#wantArtwork(artCheckboxId);
    if (wantArt && !hasApiKey()) {
      ui.notifications.error(game.i18n.localize('MCC.Errors.NoApiKey'));
      return;
    }
    await this.#withBusy('create', async (signal) => {
      const actor = await createCreatureActor(spec);
      ui.notifications.info(game.i18n.format('MCC.Create.Success', { name: actor.name, level: spec.level }));

      if (wantArt) {
        this.#busy = 'artwork';
        this.render();
        try {
          const size = game.settings.get(MODULE_ID, SETTINGS.imageSize);
          const quality = game.settings.get(MODULE_ID, SETTINGS.imageQuality);
          const image = await generateImage({ prompt: portraitPrompt(spec), size, quality, signal });
          const path = await saveImage(image.b64, image.mimeType, spec.name);
          await applyArtwork(actor, path);
          ui.notifications.info(game.i18n.format('MCC.Create.ArtSuccess', { name: actor.name }));
        } catch (error) {
          // The actor exists and is fine; art is the only thing that failed.
          if (error.name === 'AbortError') throw error;
          console.error(`${MODULE_ID} | artwork failed`, error);
          ui.notifications.warn(game.i18n.format('MCC.Create.ArtFailed', { message: error.message }));
        }
      }
      actor.sheet?.render(true);
    });
  }
}

const signed = (n) => (typeof n === 'number' && n >= 0 ? `+${n}` : `${n}`);
