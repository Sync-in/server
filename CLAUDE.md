# Claude operating notes for this repo

This is a fork of [`Sync-in/server`](https://github.com/Sync-in/server), maintained under `zjean/server`. Full workflow details live in [`docs/plans/2026-04-22-fork-maintenance-design.md`](docs/plans/2026-04-22-fork-maintenance-design.md). This file is the short, load-bearing version.

## Branch protection

`main` and `upstream-main` are both protected:

- **`main`** — direct pushes are blocked. All changes (including docs, CI config, trivial fixes) must go through a pull request. The `test` status check must pass and any PR conversations must be resolved before merge.
- **`upstream-main`** — a pure mirror of `upstream/main`. Only the `upstream-sync.yml` workflow should write to it (force-push allowed; human pushes blocked by PR-equivalent requirement).

### Practical implications

- Never attempt `git push origin main` directly. It will be rejected.
- Every change, even a one-line doc fix, flows: feature branch → push → open PR → wait for `test` green → merge.
- Feature branches are auto-deleted on merge (`delete_branch_on_merge: true`).

## Branch naming and commit conventions

| Purpose | Branch prefix | Commit prefix |
|---|---|---|
| New customization (feature, module, config) | `feat/<topic>` | `feat(<area>): ...` or `custom(<area>): ...` |
| Bug fix in our code | `fix/<topic>` | `fix(<area>): ...` |
| Edit to an upstream file (theming, behavior tweak) | `mod/<topic>` | `mod(<area>): ...` |
| Docs / plans / CI-only changes | `docs/<topic>` or `chore/<topic>` | `docs(...)` / `chore(...)` |
| Work intended to be PR'd upstream | `upstream-contrib/<topic>` | conventional commits, **no `custom-` paths, no fork-flavored language** — must cherry-pick cleanly onto upstream |

**Upstream-contrib branches must be rooted at `upstream/main`, not `main`.** Example:

```bash
git fetch upstream
git checkout -b upstream-contrib/fix-foo upstream/main
```

### Customization isolation

- **Additions** live under `custom-*` paths (e.g. `backend/src/applications/custom-auth`, `frontend/src/app/applications/custom-dashboard`, `_custom-overrides.scss`). Upstream never touches these — zero merge conflicts.
- **i18n** keys added by this fork use the `custom.` prefix.
- **In-place modifications** to upstream files stay small and atomic, with a `mod(<area>): ...` commit message so they're greppable (`git log --grep '^mod('`).

## Merge strategy per PR type

The repo has Squash and Merge-commit both enabled; Rebase is disabled. Pick per PR:

- **Feature / fix / mod / docs / chore PRs → Squash and merge.** Keeps `main`'s history clean; one commit per logical change.
- **Upstream sync PRs (`upstream-main` → `main`) → Create a merge commit.** Preserves the merge point so upstream history stays legible; full upstream history remains available on the `upstream-main` branch regardless.

GitHub remembers the user's last-used strategy; double-check the dropdown on upstream-sync PRs.

## Versioning and releases

- Version scheme: `<upstream-base>-custom.<n>` — e.g. `2.2.1-custom.1`, `2.2.1-custom.2`, then reset on upstream bump to `2.2.2-custom.1`.
- `package.json` `version` field holds the current value (root + backend + frontend all align).
- Releases are cut by tagging `v<version>` on `main`. The tag fires `release.yml` (archives + draft GitHub Release) and `build-image.yml` (versioned image).
- Image: `ghcr.io/zjean/sync-in-server`. Tags published automatically:
  - Every push to `main` → `:main`, `:sha-<short>`
  - Every `v*.*.*` tag → `:<version>`, `:<major>.<minor>`, `:latest`
  - No DockerHub, no npm publish.

## Upstream remote and license

- Remote `upstream` → `git@github-prive:Sync-in/server.git` (push intentionally disabled via `DISABLE` push URL).
- Upstream sync is automated: `upstream-sync.yml` runs weekly + on `workflow_dispatch`, force-pushes `upstream/main` → `origin/upstream-main`, and opens a PR into `main` when there's new upstream work.
- License is **AGPL-3.0-or-later**. Preserve the `LICENSE` file, keep `"license": "AGPL-3.0-or-later"` in every `package.json`, and never strip upstream copyright headers. If this server is deployed for anyone but the maintainer, a user-visible "Source: github.com/zjean/server" link must appear in the UI (§13 network clause).

## Tooling note: `rtk` wrapper

The user runs git/gh via the `rtk` proxy (token savings). A few commands don't pass through cleanly and need `rtk proxy` to bypass:

- `git commit --allow-empty` — rtk's git wrapper rejects `--allow-empty`.
- `gh api` calls that return JSON — rtk may reshape the output to a schema stub; use `rtk proxy gh api ...` when you need the real response.

Normal `git status`, `git diff`, `gh pr create`, `gh run list`, etc. work unmodified.
