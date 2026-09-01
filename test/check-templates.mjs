/**
 * Renders every template with real Handlebars and checks the seams that
 * break silently in Foundry: an action button whose handler is not
 * registered, a data-bind the change handler does not route, a partial the
 * shell references but setup never loads.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { makeCheck, root } from './harness.mjs';

const { check, done } = makeCheck();

const templates = path.join(root, 'templates');
const partialsDir = path.join(templates, 'partials');

Handlebars.registerHelper('localize', (key, options) => {
  if (options?.hash && Object.keys(options.hash).length) {
    return `${key} ${JSON.stringify(options.hash)}`;
  }
  return key;
});
Handlebars.registerHelper('mccEq', (a, b) => a === b);

const partialNames = {
  'import-tab.hbs': 'mccImportTab',
  'builder-tab.hbs': 'mccBuilderTab',
  'spec-preview.hbs': 'mccSpecPreview',
};
for (const file of readdirSync(partialsDir)) {
  Handlebars.registerPartial(partialNames[file], readFileSync(path.join(partialsDir, file), 'utf8'));
}

// Every partial the shell (or a partial) references must be one setup loads.
const moduleSource = readFileSync(path.join(root, 'scripts', 'module.js'), 'utf8');
const allTemplateSource = [
  readFileSync(path.join(templates, 'creator-view.hbs'), 'utf8'),
  ...readdirSync(partialsDir).map((f) => readFileSync(path.join(partialsDir, f), 'utf8')),
].join('\n');
for (const m of allTemplateSource.matchAll(/\{\{>\s*([A-Za-z0-9]+)/g)) {
  check(`partial ${m[1]} is registered at setup`, moduleSource.includes(`${m[1]}:`), true);
}

const specContext = {
  name: 'Preview Beast',
  level: 4,
  traits: ['lg', 'beast'],
  perception: '+12',
  senses: 'darkvision 60 ft.',
  abilities: 'Str +5',
  ac: 21,
  fort: '+14',
  ref: '+9',
  will: '+11',
  hp: 60,
  immunities: 'poison',
  resistances: 'cold 5',
  weaknesses: 'fire 5',
  speed: '25 feet',
  strikes: [{ line: 'Jaws +14, 2d8+5 piercing' }],
  skills: 'Athletics +12',
  spell: null,
  spellEntries: [{ line: 'Innate Spellcasting (divine) DC 21, attack +13: translocate (at will)' }],
  languages: 'common',
  specials: [{ name: 'Rend', actionType: 'action', description: 'Tears things.' }],
};

const tierRow = {
  key: 'ac',
  label: 'MCC.Stat.AC',
  isDefault: true,
  options: [{ value: 'high', label: 'High', selected: true }],
  value: 21,
};

const context = {
  busy: null,
  busyParse: false,
  busyCreate: false,
  busyArtwork: false,
  busyRewrite: false,
  hasApiKey: true,
  model: 'test-model',
  isImport: true,
  isBuilder: false,
  importText: 'pasted text',
  parseMissing: ['Hit Points'],
  parsedVia: 'text',
  parsed: { name: 'X', crText: '3', type: 'lg beast', specialCount: 2, attackCount: 1 },
  importLevels: [{ value: 3, selected: true }],
  importTiers: [tierRow],
  importSpec: specContext,
  builder: {
    name: 'Draft',
    level: [{ value: 3, selected: true }],
    speed: 25,
    description: 'desc',
    traits: 'undead',
    roadMaps: [{ value: 'brute', label: 'Brute', selected: true }],
    sizes: [{ value: 'med', label: 'Medium', selected: true }],
    rarities: [{ value: 'common', label: 'Common', selected: true }],
    tiers: [tierRow],
    abilities: [{ key: 'str', label: 'STR', options: tierRow.options, value: 5 }],
    strikes: [{ index: 0, name: 'Jaws', isRanged: false, damageTypes: [{ value: 'piercing', selected: true }] }],
    skills: [{ index: 0, options: [{ value: 'athletics', selected: true }], tiers: tierRow.options }],
  },
  builderSpec: specContext,
};

const shell = Handlebars.compile(readFileSync(path.join(templates, 'creator-view.hbs'), 'utf8'));

const importHtml = shell(context);
const builderHtml = shell({ ...context, isImport: false, isBuilder: true });

check('import tab renders its preview', importHtml.includes('Preview Beast'), true);
check('spell entries render in the preview', importHtml.includes('translocate (at will)'), true);
check('import tab shows the missing-field warning', importHtml.includes('MCC.Import.MissingField'), true);
check('builder tab renders rows', builderHtml.includes('builder.strike.0.name'), true);
check('builder remove buttons carry their index',
  builderHtml.includes('data-action="removeStrike" data-index="0"'), true);

// Every data-action in the rendered HTML must be registered on the view.
const viewSource = readFileSync(path.join(root, 'scripts', 'apps', 'creator-view.js'), 'utf8');
const registered = [...viewSource.matchAll(/^\s{6}(\w+): CreatorView\./gm)].map((m) => m[1]);
for (const html of [importHtml, builderHtml]) {
  for (const m of html.matchAll(/data-action="(\w+)"/g)) {
    check(`action ${m[1]} has a registered handler`, registered.includes(m[1]), true);
  }
}

// Every data-bind must be routed by the change handler's scopes.
const binds = new Set([...importHtml.matchAll(/data-bind="([\w.]+)"/g),
  ...builderHtml.matchAll(/data-bind="([\w.]+)"/g)].map((m) => m[1]));
for (const bind of binds) {
  const [scope] = bind.split('.');
  check(`bind ${bind} uses a routed scope`, ['import', 'builder'].includes(scope), true);
}
check('binds cover both tabs', binds.size >= 10, true);

// The busy state must actually disable the create path.
const busyHtml = shell({ ...context, busy: 'create', busyCreate: true });
check('busy create hides the submit button', busyHtml.includes('data-action="createImport"'), false);
check('busy create offers cancel', busyHtml.includes('data-action="cancel"'), true);

// Without an API key, AI-dependent buttons are disabled but the module works.
const keyless = shell({ ...context, hasApiKey: false });
check('keyless still offers deterministic parse',
  /<button type="button" data-action="parse"\s*>/.test(keyless), true);
check('keyless disables the AI parse', /data-action="aiParse" disabled/.test(keyless), true);

done('templates render and their seams line up');
