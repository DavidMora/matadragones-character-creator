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
import { generateConcept, conceptToDraft } from '../ai/concept.js';
import { ROLES, budgetSummary, levelForRole } from '../encounter.js';
import { validateDraft, budgetScore, publishedBand } from '../creature-rules.js';
import { readDropData, describeDropped, droppedToSpecial, addDrop } from '../drops.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How often an innate spell can be cast, as the sheet expresses it. */
const FREQUENCIES = [
  { value: 'at-will', label: 'MCC.Frequency.AtWill' },
  { value: 'constant', label: 'MCC.Frequency.Constant' },
  { value: '1', label: 'MCC.Frequency.Once' },
  { value: '2', label: 'MCC.Frequency.Twice' },
  { value: '3', label: 'MCC.Frequency.Thrice' },
];

const frequencyOf = (spell) => (spell.constant ? 'constant'
  : spell.atWill ? 'at-will'
    : spell.uses ? String(spell.uses) : 'at-will');

const frequencyToUses = (value) => ({
  atWill: value === 'at-will',
  constant: value === 'constant',
  uses: /^\d+$/.test(value) ? Number(value) : null,
});

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
  #busy = null; // null | 'parse' | 'rewrite' | 'concept' | 'create' | 'artwork'
  #brief = '';
  #gearEntry = '';
  #wantArt = false;
  #partyLevel = 1;
  #partySize = 4;
  #role = 'matched';
  #corrections = [];
  #abort = null;

  constructor(options = {}) {
    super(options);
    this.#builder = {
      ...seedFromRoadMap('balanced', 3),
      name: '', size: 'med', rarity: 'common', traits: [], speed: 25,
      description: '', gear: '', tradition: null,
      senses: [], languages: [],
      strikes: [{ name: 'Fist', kind: 'melee', damageType: 'bludgeoning' }],
      skills: [],
      contents: { spells: [], specials: [], gear: [] },
    };
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
      concept: CreatorView.#onConcept,
      removeDrop: CreatorView.#onRemoveDrop,
      addGear: CreatorView.#onAddGear,
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
      gearEntry: this.#gearEntry,
      wantArt: this.#wantArt,
      contents: {
        spells: draft.contents.spells.map((entry, index) => ({
          ...entry,
          index,
          bucket: 'spells',
          frequencies: FREQUENCIES.map((f) => ({
            value: f.value,
            label: game.i18n.localize(f.label),
            selected: f.value === frequencyOf(entry),
          })),
        })),
        specials: draft.contents.specials.map((entry, index) => ({
          ...entry, index, bucket: 'specials',
        })),
        gear: draft.contents.gear.map((entry, index) => ({
          ...entry, index, bucket: 'gear',
        })),
      },
      spellCount: draft.contents.spells.length,
    };

    // The AI concept panel, and the encounter maths behind the level it uses.
    const level = levelForRole(this.#partyLevel, this.#role);
    const budget = budgetSummary(this.#partyLevel, this.#partySize, draft.level);
    context.concept = {
      brief: this.#brief,
      partyLevel: this.#partyLevel,
      partySize: this.#partySize,
      busy: this.#busy === 'concept',
      roles: Object.entries(ROLES).map(([value, role]) => ({
        value,
        label: game.i18n.localize(role.label),
        selected: value === this.#role,
        level: levelForRole(this.#partyLevel, value),
      })),
      suggestedLevel: level,
      xp: budget.xp,
      threat: game.i18n.localize(`MCC.Threat.${budget.alone}`),
      moderateBudget: budget.budgets.moderate,
      fitModerate: budget.fitModerate,
      corrections: this.#corrections.map((c) => game.i18n.format('MCC.Rules.Corrected', c)),
    };

    // Guardrails, recomputed every render so the GM sees them while editing.
    const { errors, warnings } = validateDraft(draft);
    const band = publishedBand();
    context.rules = {
      errors: errors.map((e) => game.i18n.format(e.message, e.data)),
      warnings: warnings.map((w) => game.i18n.format(w.message, w.data)),
      score: budgetScore(draft),
      band: `${band.min}..${band.max}`,
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
      spell: spec.spell && !spec.spellcasting?.entries?.length
        ? game.i18n.format('MCC.Preview.SpellLine', { dc: spec.spell.dc, attack: signed(spec.spell.attack) })
        : null,
      spellEntries: (spec.spellcasting?.entries ?? []).map((entry) => ({
        line: `${entry.name} (${entry.tradition}) DC ${entry.dc}, attack ${signed(entry.attack)}: `
          + entry.spells.map((s) => s.name
            + (s.constant ? ' (constant)' : s.atWill ? ' (at will)' : s.uses ? ` (${s.uses}/day)` : '')).join(', '),
      })),
      languages: [spec.languages.join(', '), spec.languageDetails].filter(Boolean).join('; '),
      items: (spec.equipment ?? []).map((item) => item.name).join(', '),
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

    // ApplicationV2 has no drag-drop support of its own, so the listeners are
    // wired by hand - once, on the frame, and delegated to whichever zone the
    // pointer is actually over.
    this.element.addEventListener('dragover', (event) => {
      if (!event.target.closest?.('.mcc-drop-zone')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    this.element.addEventListener('dragenter', (event) => {
      const zone = event.target.closest?.('.mcc-drop-zone');
      if (!zone) return;
      event.preventDefault();
      // dragenter/leave fire for child elements too, so track nesting depth
      // rather than toggling a class on every crossing.
      zone.dataset.depth = String((Number(zone.dataset.depth) || 0) + 1);
      zone.classList.add('mcc-drop-hover');
    });
    this.element.addEventListener('dragleave', (event) => {
      const zone = event.target.closest?.('.mcc-drop-zone');
      if (!zone) return;
      const depth = (Number(zone.dataset.depth) || 1) - 1;
      zone.dataset.depth = String(Math.max(depth, 0));
      if (depth <= 0) zone.classList.remove('mcc-drop-hover');
    });
    this.element.addEventListener('drop', (event) => {
      const zone = event.target.closest?.('.mcc-drop-zone');
      if (!zone) return;
      event.preventDefault();
      zone.dataset.depth = '0';
      zone.classList.remove('mcc-drop-hover');
      this.#handleDrop(event);
    });
  }

  /** Resolve a dropped document and file it in the right bucket. */
  async #handleDrop(event) {
    const data = readDropData(event);
    if (!data || data.type !== 'Item' || !data.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications.warn(game.i18n.localize('MCC.Drop.Unresolved'));
      return;
    }

    const entry = describeDropped(item);
    if (!entry) {
      ui.notifications.warn(game.i18n.format('MCC.Drop.WrongType', { type: item.type }));
      return;
    }
    // A dropped NPC attack is a statted strike; the builder rebuilds strikes
    // from its own tiers, so take the name and let the tables do the rest.
    if (entry.bucket === 'strikes') {
      this.#builder.strikes.push({ name: entry.name, kind: 'melee', damageType: 'bludgeoning' });
      ui.notifications.info(game.i18n.format('MCC.Drop.Added', { name: entry.name }));
      this.render();
      return;
    }

    if (entry.bucket === 'specials') {
      // Store the special itself, so the list row and the spec agree.
      Object.assign(entry, droppedToSpecial(entry, item), { bucket: 'specials', img: entry.img });
    }
    if (entry.bucket === 'spells' && !this.#builder.spell) {
      // A creature holding spells needs a spell DC tier to read them from.
      this.#builder.spell = 'moderate';
    }
    if (!addDrop(this.#builder, entry)) {
      ui.notifications.info(game.i18n.format('MCC.Drop.Duplicate', { name: entry.name }));
      return;
    }
    ui.notifications.info(game.i18n.format('MCC.Drop.Added', { name: entry.name }));
    this.render();
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

    if (scope === 'art') {
      // The checkbox is state, not a DOM reading: every tier change
      // re-renders, and a checkbox with no backing field silently unticks.
      this.#wantArt = Boolean(value);
      return;
    }

    if (scope === 'concept') {
      if (path[0] === 'brief') {
        this.#brief = value;
        return; // Typing a brief should not re-render mid-sentence.
      }
      if (path[0] === 'partyLevel') this.#partyLevel = Math.min(Math.max(Number(value) || 1, 1), 20);
      if (path[0] === 'partySize') this.#partySize = Math.min(Math.max(Number(value) || 4, 1), 10);
      if (path[0] === 'role') this.#role = value;
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
      // ...but a creature holding spells still needs a tier to read their DC
      // from, and most road maps seed none. Silently dropping the spell entry
      // while its rows stay on screen is the worst of both.
      if (!draft.spell && draft.contents.spells.length) draft.spell = 'moderate';
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
    } else if (key === 'spellFreq') {
      const spell = draft.contents.spells[Number(path[1])];
      if (!spell) return;
      Object.assign(spell, frequencyToUses(value));
    } else if (key === 'skill') {
      const skill = draft.skills[Number(path[1])];
      if (!skill) return;
      skill[path[2]] = value;
    } else if (key === 'gearEntry') {
      // Live text for the add-gear box: kept on the instance so the render
      // this change triggers puts it back rather than blanking it.
      this.#gearEntry = value;
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
      const applied = [];
      for (const special of this.#parsed.specials) {
        const clean = special.name.replace(/\s*\([^)]*\)\s*$/, '');
        if (byName.has(clean)) {
          special.description = byName.get(clean);
          applied.push(clean);
        }
      }
      // An ability translated into PF2e idiom (Pack Tactics becomes Pack
      // Attack, Legendary Resistance gets a canned description) is rebuilt
      // from mechanics5e on every conversion, so a rewrite of it would be
      // silently thrown away. Say so rather than charging for nothing.
      const ignored = [...byName.keys()].filter((name) => !applied.includes(name));
      if (ignored.length) {
        ui.notifications.info(
          game.i18n.format('MCC.Import.RewriteSkipped', { list: ignored.join(', ') }),
        );
      }
    });
  }

  static async #onCreateImport() {
    if (!this.#parsed) return;
    await this.#createFromSpec(this.#importSpec());
  }

  static async #onCreateBuilder() {
    if (!this.#builder.name?.trim()) {
      ui.notifications.warn(game.i18n.localize('MCC.Builder.NameRequired'));
      return;
    }
    // The selects constrain the vocabulary, but not the rules that are not
    // vocabulary - three extreme statistics is reachable by hand, and the
    // red text saying so was previously advisory only.
    const { errors } = validateDraft(this.#builder);
    if (errors.length) {
      ui.notifications.error(
        game.i18n.format('MCC.Rules.Blocked', { message: game.i18n.format(errors[0].message, errors[0].data) }),
      );
      return;
    }
    const spec = specFromBuilder(this.#builder);
    await this.#createFromSpec(spec);
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

  /** "Create an evil necromancer to challenge my 5th level party." */
  static async #onConcept() {
    const field = this.element?.querySelector('[data-bind="concept.brief"]');
    if (field) this.#brief = field.value;
    if (!this.#brief.trim()) {
      ui.notifications.warn(game.i18n.localize('MCC.Concept.BriefRequired'));
      return;
    }
    if (!hasApiKey()) {
      ui.notifications.error(game.i18n.localize('MCC.Errors.NoApiKey'));
      return;
    }

    await this.#withBusy('concept', async (signal) => {
      // The level is ours, from the party and the role, not the model's.
      const level = levelForRole(this.#partyLevel, this.#role);
      const concept = await generateConcept({
        brief: this.#brief,
        level,
        role: game.i18n.localize(ROLES[this.#role]?.label ?? 'MCC.Role.Matched'),
        partyLevel: this.#partyLevel,
        partySize: this.#partySize,
      }, { signal });

      const { draft, corrections } = conceptToDraft(concept, level);
      // Anything the GM already dragged in survives the concept landing.
      // Anything already dragged in survives the concept landing, merged
      // into the lists it proposes.
      const kept = this.#builder.contents;
      this.#builder = {
        ...draft,
        contents: {
          spells: [...draft.contents.spells, ...kept.spells],
          specials: [...draft.contents.specials, ...kept.specials],
          gear: [...draft.contents.gear, ...kept.gear],
        },
      };
      this.#corrections = corrections;
      this.#tab = 'builder';
      if (corrections.length) {
        ui.notifications.info(
          game.i18n.format('MCC.Concept.Corrected', { count: corrections.length }),
        );
      }
      if (draft.spell && !draft.contents.spells.length) {
        ui.notifications.warn(game.i18n.localize('MCC.Concept.NoSpells'));
      }
      ui.notifications.info(game.i18n.format('MCC.Concept.Ready', { name: draft.name, level }));
    });
  }

  static #onRemoveDrop(_event, target) {
    const { bucket, index } = target.dataset;
    this.#builder.contents[bucket]?.splice(Number(index), 1);
    this.render();
  }

  /** Type a name to add gear without hunting for it in a compendium. */
  static #onAddGear() {
    const field = this.element?.querySelector('[data-bind="builder.gearEntry"]');
    const names = String(this.#gearEntry ?? field?.value ?? '').split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    for (const name of names) {
      const clean = name.toLowerCase();
      if (this.#builder.contents.gear.some((item) => item.name === clean)) continue;
      this.#builder.contents.gear.push({ bucket: 'gear', uuid: null, name: clean });
    }
    this.#gearEntry = '';
    if (field) field.value = '';
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

  #wantArtwork() {
    return this.#wantArt;
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

  async #createFromSpec(spec) {
    const wantArt = this.#wantArtwork();
    if (wantArt && !hasApiKey()) {
      ui.notifications.error(game.i18n.localize('MCC.Errors.NoApiKey'));
      return;
    }
    await this.#withBusy('create', async (signal) => {
      const actor = await createCreatureActor(spec, { signal });
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
