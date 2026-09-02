/**
 * The manifest, and the release it describes.
 *
 * Foundry reads `module.json` and nothing else to decide what to load. A path
 * in it that does not exist means the module is silently inactive - the same
 * symptom a dangling import produces, with the same absence of an error
 * message - and a version that disagrees with the tag means Foundry never
 * offers the update. Both are cheap to assert and expensive to discover.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeCheck, root } from './harness.mjs';

const { check, done } = makeCheck();

const manifest = JSON.parse(readFileSync(path.join(root, 'module.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

// --- Identity ----------------------------------------------------------------
check('the id is a valid package id',
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id), true);
check('the id matches the npm package name', manifest.id, pkg.name);
check('title and description are present',
  [Boolean(manifest.title), (manifest.description ?? '').length > 40], [true, true]);
check('an author is named', (manifest.authors ?? []).length > 0, true);

// Foundry compares this against the installed version to offer an update, and
// the release workflow refuses a tag that disagrees with it.
check('the manifest version is semver', /^\d+\.\d+\.\d+$/.test(manifest.version), true);
check('the manifest and package versions agree', manifest.version, pkg.version);

// --- Every path it names must exist ------------------------------------------
for (const file of manifest.esmodules ?? []) {
  check(`esmodule ${file} exists`, existsSync(path.join(root, file)), true);
}
for (const file of manifest.styles ?? []) {
  check(`style ${file} exists`, existsSync(path.join(root, file)), true);
}
for (const entry of manifest.languages ?? []) {
  check(`language ${entry.lang} file exists`, existsSync(path.join(root, entry.path)), true);
  const strings = JSON.parse(readFileSync(path.join(root, entry.path), 'utf8'));
  check(`language ${entry.lang} is a non-empty object`, Object.keys(strings).length > 0, true);
}
check('at least one language ships', (manifest.languages ?? []).length > 0, true);

// The entry point has to be reachable, not merely present.
const entry = readFileSync(path.join(root, manifest.esmodules[0]), 'utf8');
check('the entry point registers an init hook', /Hooks\.once\('init'/.test(entry), true);

// --- Release plumbing ---------------------------------------------------------
/*
 * These two fields point at different places on purpose. The manifest URL has
 * to stay at `releases/latest` so an update check always finds the newest
 * version; the download URL is rewritten per release by the workflow, so a
 * user installing 1.0.0 in two years gets 1.0.0's zip and not whatever is
 * newest by then.
 */
check('the manifest URL is a latest-release URL',
  manifest.manifest.endsWith('/releases/latest/download/module.json'), true);
check('the download URL points at a zip',
  manifest.download.endsWith('module.zip'), true);
for (const field of ['url', 'manifest', 'download', 'readme', 'changelog', 'bugs', 'license']) {
  check(`${field} is an https URL`, /^https:\/\//.test(manifest[field] ?? ''), true);
}
check('every URL names this repository',
  ['url', 'manifest', 'download', 'readme', 'changelog', 'bugs', 'license']
    .every((field) => manifest[field].includes(manifest.id)), true);

// --- Compatibility -------------------------------------------------------------
check('a minimum Foundry version is declared', Boolean(manifest.compatibility?.minimum), true);
check('a verified Foundry version is declared', Boolean(manifest.compatibility?.verified), true);
const system = manifest.relationships?.systems?.[0];
check('the module declares which system it needs', system?.id, 'pf2e');
check('the system relationship carries compatibility',
  [Boolean(system?.compatibility?.minimum), Boolean(system?.compatibility?.verified)], [true, true]);

/*
 * The verified system version is a claim about testing, and it was wrong once:
 * it read 8.4.1, copied from a sibling module, while this one had only ever
 * run against 7.12.2. Pin it so changing it is a deliberate act that comes
 * with actually running there.
 */
check('the verified pf2e version is the one this module was tested against',
  system.compatibility.verified, '7.12.2');
check('the verified Foundry version is the one this module was tested against',
  manifest.compatibility.verified, '13.351');

// --- What ships ----------------------------------------------------------------
/*
 * The release zip is built from a list in the workflow. Anything the manifest
 * references must be on that list, or the module installs broken.
 */
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const shipped = ['module.json', 'LICENSE', 'NOTICE.md', 'README.md', 'CHANGELOG.md',
  'scripts', 'styles', 'templates', 'lang'];
for (const item of shipped) {
  check(`the release zip includes ${item}`, workflow.includes(`\n            ${item} \\`), true);
  check(`${item} exists to be shipped`, existsSync(path.join(root, item)), true);
}
check('the workflow runs the tests before publishing', /run: npm test/.test(workflow), true);
check('the workflow refuses a tag that disagrees with the manifest',
  workflow.includes('does not match module.json version'), true);

// Documentation the manifest links to must actually be in the repository.
for (const doc of ['README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE.md']) {
  check(`${doc} exists`, existsSync(path.join(root, doc)), true);
}
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
check('the changelog has a section for this version',
  new RegExp(`^## ${manifest.version.replace(/\./g, '\\.')}$`, 'm').test(changelog), true);

done('the manifest describes a module that can actually be installed');
