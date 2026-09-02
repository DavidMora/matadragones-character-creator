# Publishing this module

A maintainer's document. It is not shipped in the release zip.

Two things live here: how to submit the package to Foundry the first time, and
how to cut every release after that.

---

## Before the first tag

A checklist of what has to be true, and how to confirm each without guessing.

| | How to check |
|---|---|
| The repository is public on GitHub | It has to be, or Foundry cannot fetch the manifest during review. |
| `npm test` is green | 12 suites. The release workflow runs them and refuses to publish otherwise. |
| The manifest describes an installable module | `npm run test:manifest` — every path it names exists, the version matches `package.json`, the URLs resolve to this repository, and the release zip's file list covers everything the manifest references. |
| The version claims are true | `compatibility.verified` says Foundry **14.367**, and the pf2e relationship says **8.4.1**. The module was run on both that pairing and Foundry 13.351 with pf2e 7.12.2. If you test on another, change them *after* testing, not before — the manifest test pins both so the change is deliberate. |
| A licence is present | `LICENSE` (MIT), linked from the manifest. |
| `CHANGELOG.md` has a section for the version | The workflow takes the release notes from it and fails if the section is missing or empty. |

---

## First-time submission

### 1. Push the repository

```
git remote add origin https://github.com/DavidMora/matadragones-character-creator.git
git push -u origin main
```

Nothing in `.gitignore` needs to ship; the release zip is built from an
explicit list in the workflow, not from the working tree.

### 2. Tag the release

The tag drives everything. It must be `v` plus the manifest version:

```
git tag v1.0.0
git push origin v1.0.0
```

That runs `.github/workflows/release.yml`, which:

1. runs `npm test` — nothing ships from a red suite;
2. refuses the tag if it disagrees with `module.json`, since Foundry decides
   whether to offer an update by comparing versions;
3. rewrites `download` to point at *this* release's zip while leaving
   `manifest` at `releases/latest` (see below);
4. builds `module.zip` from the shipped files only;
5. publishes both assets with the changelog section as the release body.

**Why the two URLs differ.** `manifest` must stay at
`releases/latest/download/module.json` so an update check always finds the
newest version. `download` is rewritten per release, so a GM installing 1.0.0
two years from now gets 1.0.0's zip rather than whatever is newest by then.

### 3. Confirm the assets resolve

Before submitting, fetch both URLs the way Foundry will:

```
curl -sIL https://github.com/DavidMora/matadragones-character-creator/releases/latest/download/module.json | grep -i '^HTTP'
curl -sIL https://github.com/DavidMora/matadragones-character-creator/releases/latest/download/module.zip  | grep -i '^HTTP'
```

Both must end in `200`. Then install it into a clean world from the manifest
URL — the same path a reviewer and every user takes — and confirm the module
appears in Manage Modules and the window opens.

### 4. Submit the package

Log in at **foundryvtt.com** with the account holding your Foundry licence.
Your profile → **Packages** → **Submit New Package**.

| Field | Value |
|---|---|
| Package Type | Module |
| Package Name | `matadragones-character-creator` |
| Package Title | Matadragones Character Creator |
| Manifest URL | `https://github.com/DavidMora/matadragones-character-creator/releases/latest/download/module.json` |
| Project URL | `https://github.com/DavidMora/matadragones-character-creator` |
| Readme URL | `https://github.com/DavidMora/matadragones-character-creator/blob/main/README.md` |
| Changelog URL | `https://github.com/DavidMora/matadragones-character-creator/blob/main/CHANGELOG.md` |
| Bug Reporter URL | `https://github.com/DavidMora/matadragones-character-creator/issues` |

Field labels may read slightly differently; match them by meaning. The
**Manifest URL** is the one that matters — Foundry fetches it during review and
on every update check afterwards. Everything else can be edited later.

**Package Name is the id and is permanent.** On approval,
`matadragones-character-creator` is yours and cannot be renamed or moved to a
different id. It is also the folder name in every user's `Data/modules/`.

### 5. Description for the listing

The manifest carries one; the listing wants its own. This works:

> Build Pathfinder 2e creatures from the GM Core Building Creatures tables, or
> import a stat block from the world's oldest roleplaying game (5th edition),
> Pathfinder First Edition, or Pathfinder Second Edition. Foreign systems are
> converted deterministically — each statistic is ranked against what that
> system expects at its challenge rating and the value is read from the
> published tables, so the same paste always produces the same creature —
> while a Pathfinder Second Edition block is transcribed as printed. Describe
> a creature in a sentence and OpenAI proposes the concept while the module
> owns every number; drag spells, abilities and gear in from any compendium.
> Works fully without an API key.

### 6. Tags

Pick the ones that fit: *Content Creation*, *Actors*, *Automation*,
*Compendium*. Systems: **pf2e**.

### 7. After approval

Foundry reviews by hand; expect days rather than minutes. Once approved the
listing appears at `foundryvtt.com/packages/matadragones-character-creator`,
and GMs can install it by pasting the manifest URL or by searching the
in-app package browser.

---

## Every release after the first

1. Do the work; keep `npm test` green.
2. Add a `## x.y.z` section to `CHANGELOG.md` describing what changed for a
   GM, not for a developer.
3. Bump `version` in **both** `module.json` and `package.json` — the manifest
   test asserts they agree.
4. Commit, then tag and push:

```
git tag v1.1.0
git push origin main --tags
```

The workflow does the rest. Nothing needs to be re-submitted to Foundry: the
listing points at `releases/latest`, so a new release is offered to every
installed copy automatically.

### If a release goes wrong

Delete the GitHub release and the tag, fix, and re-tag. A version already
downloaded by users cannot be recalled, so prefer publishing `x.y.z+1` over
rewriting a tag that has been live for any length of time.

---

## Compatibility, honestly

`compatibility.verified` is a claim that the module was run there. Keep it
true. When testing on a newer Foundry or pf2e:

1. run the module there — open the window, import a block, build a creature,
   create an actor;
2. update `compatibility.verified` and the pf2e relationship;
3. update the pinned values in `test/check-manifest.mjs`, which exist so this
   is a deliberate two-place change rather than a copied number.

The pinning is there because the claim was wrong once: it read pf2e 8.4.1,
copied from a sibling module, before this one had ever run there. It has now
actually been run there — which is what makes the same number legitimate.
