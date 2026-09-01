import { MODULE_ID } from './constants.js';
import { registerSettings } from './settings.js';
import { CreatorView } from './apps/creator-view.js';
import { parse5eStatBlock } from './parse5e.js';
import { classify, convertCreature, specFromBuilder, seedFromRoadMap } from './convert.js';
import { actorDataFromSpec, createCreatureActor } from './actor.js';

Hooks.once('init', () => {
  registerSettings();
  // Namespaced so the templates never depend on which comparison helpers a
  // given Foundry version happens to ship.
  Handlebars.registerHelper('mccEq', (a, b) => a === b);
  Handlebars.registerHelper('mccConcat', (...args) => args.slice(0, -1).join(''));

  // The whole deterministic pipeline is exposed so a macro or another module
  // can convert without the window: parse -> convert -> create.
  game.modules.get(MODULE_ID).api = {
    open: () => CreatorView.open(),
    parse5eStatBlock,
    classify,
    convertCreature,
    seedFromRoadMap,
    specFromBuilder,
    actorDataFromSpec,
    createCreatureActor,
    CreatorView,
  };
});

Hooks.once('setup', async () => {
  await foundry.applications.handlebars.loadTemplates({
    mccImportTab: `modules/${MODULE_ID}/templates/partials/import-tab.hbs`,
    mccBuilderTab: `modules/${MODULE_ID}/templates/partials/builder-tab.hbs`,
    mccSpecPreview: `modules/${MODULE_ID}/templates/partials/spec-preview.hbs`,
  });
});

/**
 * GMs look for creature tools where creatures live: a button in the Actors
 * sidebar header is the primary entry point, with a scene control as backup.
 */
Hooks.on('renderActorDirectory', (_app, element) => {
  if (!game.user.isGM) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const header = root?.querySelector('.directory-header');
  if (!header || header.querySelector('.mcc-open-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mcc-open-button';
  button.innerHTML = `<i class="fa-solid fa-dragon"></i> ${game.i18n.localize('MCC.View.Title')}`;
  button.addEventListener('click', () => CreatorView.open());
  header.prepend(button);
});

Hooks.on('getSceneControlButtons', (controls) => {
  if (!game.user?.isGM) return;
  const tool = {
    name: 'mcc-creator',
    title: 'MCC.View.Title',
    icon: 'fa-solid fa-dragon',
    order: 99,
    button: true,
    visible: true,
    onClick: () => CreatorView.open(),
    onChange: () => CreatorView.open(),
  };

  // v13 hands over a record keyed by control name; older versions use arrays.
  if (Array.isArray(controls)) {
    const tokens = controls.find((control) => control.name === 'token' || control.name === 'tokens');
    if (tokens) tokens.tools.push(tool);
    return;
  }
  const tokens = controls.tokens ?? controls.token;
  if (!tokens) return;
  tokens.tools[tool.name] = tool;
});
