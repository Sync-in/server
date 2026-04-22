# Fork maintenance design

**Date:** 2026-04-22
**Upstream:** `Sync-in/sync-in-server` (AGPL-3.0-or-later)
**Fork:** `zjean/server`
**Customization prefix:** `custom-`

## Goals

1. Maintain a long-lived fork with our own additions and modifications.
2. Pull in upstream changes on a cadence, with minimal merge pain.
3. Publish our own multi-arch Docker images via GitHub Actions.
4. Retain the ability to contribute selected changes back to upstream.
5. Stay compliant with the upstream AGPL-3.0-or-later license.

## 1. Branch topology and remotes

### Remotes

- `origin` → `git@github-prive:zjean/server.git` (already set)
- `upstream` → `git@github-prive:Sync-in/sync-in-server.git` (to add)

```bash
git remote add upstream git@github-prive:Sync-in/sync-in-server.git
git remote set-url --push upstream DISABLE  # guard against accidental push
```

### Branches

| Branch | Role | Write path |
|---|---|---|
| `upstream-main` | Exact mirror of upstream `main`. No local commits ever. | Automated mirror workflow only. |
| `main` | Our product. CI builds images from here. | Merge commits from `upstream-main`; PRs from `feat/*`, `fix/*`, `mod/*`. |
| `feat/*`, `fix/*`, `mod/*` | Short-lived customization work. | PR into `main`. |
| `upstream-contrib/<topic>` | Work intended to be PR'd to upstream. Branched from `upstream/main`. | PR to `Sync-in/sync-in-server:main`. |

### Sync cadence

A scheduled GitHub Action mirrors `upstream/main` → `origin/upstream-main` weekly and on manual dispatch. It opens a PR `upstream-main` → `main` whenever there is new upstream work; we review and merge on our own schedule.

Merges always use `--no-ff`, so every upstream pull appears as a visible merge commit. Tag each merge: `merge/upstream-<version>` for scannability.

### Branch protection on `main`

- Require PR
- Require CI green
- `upstream-main` is protected but writable by the mirror workflow (bot-only)

## 2. Customization isolation

Additions are kept conflict-free via a `custom-` prefix on new files and directories. Modifications to upstream files are kept small, atomic, and greppable.

### Additions — isolated directories

| Surface | Upstream path | Our customization path |
|---|---|---|
| Backend modules | `backend/src/applications/*` | `backend/src/applications/custom-*` |
| Frontend apps | `frontend/src/app/applications/*` | `frontend/src/app/applications/custom-*` |
| i18n keys | `frontend/src/i18n/*.json` | Prefix new keys with `custom.` |
| Env/config | `environment/environment.dist.yaml` | New top-level `custom:` section |
| SCSS overrides | `frontend/src/styles/components/*` | New file `_custom-overrides.scss`, imported last |

Because upstream never touches `custom-*` paths or `custom.` keys, these additions never produce merge conflicts.

### Modifications — atomic and labeled

For in-place edits (theming, auth tweaks, behavior changes):

- One logical change per commit.
- Commit message prefix `mod(<area>): ...` so they are greppable:
  `git log --grep '^mod('`
- Keep diffs minimal. Prefer adding a CSS variable override in
  `_custom-overrides.scss` over editing upstream SCSS values.
- Where feasible, convert a modification into an addition.

### Conflict survival kit

- `git config rerere.enabled true` locally — git remembers conflict resolutions across re-merges.
- Tag each merge commit from upstream: `merge/upstream-<version>`.

## 3. Contributing back to upstream

The rule: **anything destined for upstream is developed on a branch rooted at `upstream/main`, not `main`.**

### New work intended for upstream

```bash
git fetch upstream
git checkout -b upstream-contrib/fix-foo upstream/main

# make changes — no custom- prefix, no fork-flavored commit messages

git push origin upstream-contrib/fix-foo
gh pr create --repo Sync-in/sync-in-server \
  --base main \
  --head zjean:upstream-contrib/fix-foo
```

### Extracting an already-landed change from `main`

```bash
git checkout -b upstream-contrib/fix-foo upstream/main
git cherry-pick <sha-from-main>
# resolve conflicts against vanilla upstream
# squash, drop any custom- references, write an upstream-appropriate commit message
```

Once merged upstream, delete the contrib branch. The change returns to us via the normal `upstream-main` → `main` merge.

### "Should I contribute this back?" heuristic

- Generic bug fix → yes
- Improvement to an existing upstream feature → usually yes
- New feature that is broadly useful → offer, but don't block the roadmap on it
- Branding, opinionated UX, our-business-specific logic → keep in the fork

## 4. CI/CD on GHCR

Target registry: `ghcr.io/zjean/sync-in-server`. Auth uses the built-in `GITHUB_TOKEN`; no extra secrets are required.

### Workflows

**`upstream-sync.yml`** (new)
- Triggers: weekly `schedule` + `workflow_dispatch`
- Fetches `upstream/main`, force-pushes to `origin/upstream-main`
- Opens a PR `upstream-main` → `main` when there are new commits

**`test.yml`** (keep)
- Existing lint + unit test on push/PR to `main`

**`build-image.yml`** (new — replaces the Docker bits in `release.yml`)
- Triggers:
  - `push` to `main` → `:main`, `:sha-<short>`
  - `push` tag `v*.*.*` → `:X.Y.Z-custom.N`, `:X.Y-custom`, `:latest`
  - `workflow_dispatch`
- Steps: checkout → Buildx → GHCR login with `GITHUB_TOKEN` →
  `docker/metadata-action` for tags → `docker/build-push-action` multi-arch
  (linux/amd64, linux/arm64)
- Permissions: `contents: read`, `packages: write`

**`release.yml`** (replace)
- Trigger: `v*.*.*` tag
- Keeps: `npm run release:build`, changelog extraction, draft GitHub Release on our repo
- Drops: DockerHub login, DockerHub push, npm publish (these are upstream-oriented)

### Secrets

None beyond `GITHUB_TOKEN`. Remove `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` from the fork if they were copied across.

## 5. Versioning and release

### Scheme

`<upstream-base>-custom.<n>`

- Upstream on `2.2.1` → our releases are `2.2.1-custom.1`, `2.2.1-custom.2`, …
- Upstream bumps to `2.2.2` and we merge → next release is `2.2.2-custom.1` (counter resets)
- `package.json` `version` field holds the current value

### Cutting a release

```bash
git checkout main && git pull
npm version 2.2.1-custom.2 --no-git-tag-version
# edit CHANGELOG.md: add section with upstream base reference
git add package.json CHANGELOG.md
git commit -m "chore(release): 2.2.1-custom.2"
git tag v2.2.1-custom.2
git push origin main --tags
```

`release.yml` fires on the tag → archives + draft GitHub Release.
`build-image.yml` fires on the same tag → pushes `ghcr.io/zjean/sync-in-server:2.2.1-custom.2` plus the floating tags below.

### Handling upstream version bumps during a sync merge

When `upstream-main` → `main` brings an upstream version bump:

1. Accept the upstream version for `package.json` in the merge.
2. Follow-up commit: append our suffix, e.g. `2.2.2-custom.0` (dev marker).
3. Reset the CHANGELOG's Unreleased section.
4. First release on that base is `2.2.2-custom.1`.

### Image tags we can rely on

- `:main` — latest merged code, auto-rebuilt each push
- `:latest` — most recent release tag
- `:2.2` — latest release within upstream 2.2.x
- `:2.2.1-custom` — latest on that exact upstream base
- `:2.2.1-custom.2` — pinned, immutable

### CHANGELOG

Keep our own `CHANGELOG.md`. Prefix each release section with the upstream base:

```
## [2.2.1-custom.2] — based on upstream 2.2.1
```

## 6. License compliance (AGPL-3.0-or-later)

The upstream project is licensed **AGPL-3.0-or-later**. Every decision above is compatible with that license. The following obligations apply.

### Hard requirements

1. **Preserve the `LICENSE` file and every copyright notice in source files.**
   Never strip or rewrite these. On upstream merges, always accept upstream for `LICENSE` conflicts.
2. **Modifications inherit AGPL-3.0-or-later.**
   `custom-*` modules, theming, config — everything we add or change inside this repo is a derivative work and must be AGPL. We cannot ship a proprietary or closed version of anything living in this repo.
3. **§5(a) — mark modified files.**
   Maintain a `NOTICE` file at the repo root stating that this is a fork of `Sync-in/sync-in-server`, with the fork date. Modification dates are otherwise tracked via git history and the `mod(...)` commit convention.
4. **§13 — the network clause.**
   If the server is run and third parties interact with it over a network, the corresponding source of our modified version must be offered to those users. Practically:
   - Keep `zjean/server` publicly discoverable on GitHub.
   - Add a visible "Source: github.com/zjean/server" link in the running UI (footer or `/about`).
5. **Keep `"license": "AGPL-3.0-or-later"`** in all three `package.json` files (root, `backend`, `frontend`). Never change it.

### Not permitted

- Relicensing any part of this repo to MIT, proprietary, or any non-AGPL terms.
- Distributing images or binaries to third parties without source availability.
- Removing upstream copyright attribution.
- Keeping modifications secret from users of a network-facing deployment.

### Files to add as part of this plan's implementation

- `NOTICE` at repo root — fork attribution and date
- Small UI change: a "Source" link pointing to the fork (only required if deployed for others)

## 7. Implementation order

1. Add `upstream` remote; create and push `upstream-main` (initial mirror from `upstream/main`).
2. Add `NOTICE` file.
3. Enable `git rerere` locally.
4. Write `.github/workflows/upstream-sync.yml`.
5. Write `.github/workflows/build-image.yml`.
6. Rewrite `.github/workflows/release.yml` (drop DockerHub + npm).
7. Configure GitHub branch protection on `main` and `upstream-main`.
8. First dry-run release to validate the image pipeline.
9. Add "Source: github.com/zjean/server" link in UI (when/if deployed for others).
