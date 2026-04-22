# Claude operating notes for this repo

This is a fork of [`Sync-in/server`](https://github.com/Sync-in/server), maintained under `zjean/server`. The workflow is documented in detail in [`docs/plans/2026-04-22-fork-maintenance-design.md`](docs/plans/2026-04-22-fork-maintenance-design.md).

## Branch protection

`main` and `upstream-main` are both protected:

- **`main`** — direct pushes are blocked. All changes (including docs, CI config, trivial fixes) must go through a pull request. The `test` status check must pass and any PR conversations must be resolved before merge.
- **`upstream-main`** — a pure mirror of `upstream/main`. Only the `upstream-sync.yml` workflow should write to it (force-push allowed; human pushes blocked by PR requirement equivalent).

### Practical implications

- Never attempt `git push origin main` directly. It will be rejected.
- Every change, even a one-line doc fix, flows: feature branch → push → open PR → wait for `test` green → merge.
- For upstream merges: the sync workflow opens a PR `upstream-main` → `main`. Review diff, merge via the PR.
- Customizations follow the naming conventions in the design doc: `custom-` prefix for new files/modules, `mod(<area>): ...` commit prefix for in-place edits to upstream files.

## Upstream and license

- Remote `upstream` → `git@github-prive:Sync-in/server.git` (push intentionally disabled).
- License is **AGPL-3.0-or-later**. Preserve the `LICENSE` file, keep `"license": "AGPL-3.0-or-later"` in every `package.json`, and never strip upstream copyright headers. If we deploy this for anyone but the maintainer, a user-visible "Source: github.com/zjean/server" link must appear in the UI (§13 network clause).
