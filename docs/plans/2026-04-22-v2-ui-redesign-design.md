# Sync-In v2 UI redesign — design and milestone plan

**Status**: design approved, not yet implemented
**Date**: 2026-04-22
**Scope decision**: build the redesigned UI at `/v2/*`, alongside the existing UI at `/*`, under the fork's `custom-*` isolation rules.

---

## 0 · Source material and intent

The redesign originates from a Claude Design handoff bundle (`Sync-In Redesign`). The user iterated through several visual directions with the design tool and landed on a polished "in-between" version: minimal but opinionated, warm amber primary accent with indigo nav accent, flat plum title bar, premium type pairing, strict rule that only real product functionality is shown (no invented stats, no fake settings, no speculative columns). The bundle's `Sync-In Redesign.html` + component JSX under `sync-in/project/src/` is the visual reference.

This repo is a fork of `Sync-in/server`. Customization isolation rules apply (`custom-*` paths, `custom.` i18n prefix). The design is a visual + UX overhaul, not a rewrite of upstream behavior — it ships next to the classic UI so upstream merges stay clean.

## 1 · Scope decisions

| Question | Decision |
|---|---|
| How does the new UI coexist with the old? | **A. Parallel route tree** — new UI at `/v2/*`, classic UI untouched at `/*`. |
| First-milestone scope | **Core-browse** — scaffold + chrome + Recents + Personal browser (list view) + Viewer. |
| Data/services | **Reuse existing Angular services as-is where possible**. Thin adapters only if a service shape doesn't fit the design. |
| Icons | Port the ~30 custom SVGs from the design bundle; do not reuse FontAwesome for v2. |
| Typography | Add `@fontsource-variable/geist`, `@fontsource/instrument-serif`, `@fontsource-variable/jetbrains-mono`. |

Milestone 2 explicitly **out of scope**: Spaces, Shared, Trash, File detail page, Transfers popover, grid/gallery browser modes, Search, Settings, People. These are deferred to a milestone-3 plan written after milestone 2 lands.

## 2 · Architecture and layout

### Location

Everything lives under `frontend/src/app/applications/custom-v2/`:

```
custom-v2/
├─ v2.routes.ts                 # child routes: recents, personal, viewer
├─ layout/
│   ├─ layout-v2.component.{ts,html,scss}
│   ├─ title-bar.component.*
│   ├─ app-rail.component.*
│   ├─ left-nav.component.*
│   └─ dock-rail.component.*
├─ screens/
│   ├─ recents/                 # two-panel Files + Comments
│   ├─ personal/                # file browser, list-view only for m2
│   └─ viewer/                  # image viewer
├─ components/                  # Avatar, AvatarStack, FileGlyph, Logo, Pill, Btn, IconBtn
├─ icons/                       # SVG icon component (~30 glyphs)
├─ adapters/                    # optional, only if a service shape needs reshaping
└─ styles/
    ├─ _tokens.scss             # SI.* + FILE_COLORS
    ├─ _mixins.scss
    └─ v2.scss                  # entry, imported once when /v2 active
```

### Routing

`app.routes.ts` gains a sibling route group:

```ts
{
  path: 'v2',
  component: LayoutV2Component,
  canActivate: [authGuard],
  children: v2Routes,
}
```

Classic `LayoutComponent` at `''` is untouched. The `'**'` fallback stays pointed at the classic Recents path. `LayoutV2Component` is a structural mirror of `LayoutComponent` (title bar + rail + nav + `<router-outlet>` + right rail) but in new chrome with v2-scoped SCSS.

### Opt-in UX

- **Primary**: URL prefix (`/v2/recents`, etc.).
- **Sticky**: `localStorage` key `ui.version` = `'classic' | 'v2'`. If set to `v2`, classic routes redirect the user into their last v2 path on next load.
- **Discoverability**: a small "Try redesigned UI" link added to the classic navbar's user menu; symmetrical "Back to classic" link in v2's left-nav user card footer.
- No server-side flag for this milestone — pure client toggle.

### Services

Both layouts inject the same `FilesService`, `SpacesService`, `RecentsService`, `UserService`, `CommentsService`, `LayoutService`, socket.io, auth guards, and l10n. No duplication. If a service exposes shapes that don't match the design's needs, a thin component in `custom-v2/adapters/` reshapes data on the consumer side — the service stays untouched.

## 3 · Design tokens and styling

### Token port

The JSX `SI` object and `FILE_COLORS` map (from `tokens.jsx`) become SCSS custom properties in `custom-v2/styles/_tokens.scss`, scoped under a single `.v2-root` class applied by `LayoutV2Component`. This keeps tokens out of classic routes entirely — no global CSS pollution, no class-name collisions.

```scss
.v2-root {
  --si-bg0: #07090d;  --si-bg1: #0d1117;  --si-bg2: #12171f;
  --si-bg3: #191f28;  --si-bg4: #222935;  --si-bg5: #2d3542;  --si-bg6: #3a4250;
  --si-line:        rgba(255,255,255,0.055);
  --si-line-strong: rgba(255,255,255,0.10);
  --si-line-bold:   rgba(255,255,255,0.16);
  --si-fg: #f2f3f6;  --si-fg-muted: #a9b1bd;  --si-fg-faint: #6a7280;

  // Accents
  --si-accent:       oklch(0.76 0.15 55);       // warm amber — primary actions
  --si-accent-soft:  oklch(0.76 0.15 55 / 0.14);
  --si-nav:          oklch(0.72 0.17 265);      // indigo — selected nav
  --si-nav-soft:     oklch(0.72 0.17 265 / 0.16);
  --si-chrome-bg:    oklch(0.22 0.06 275);      // flat plum (no gradient, per chat2 correction)

  // Semantic + file-type palette, radii (5/8/12/18), shadows, type families …
}
```

Fallbacks: tokens SCSS emits hex/rgb fallbacks alongside `oklch()` for browsers that predate color-4 parsing.

### Typography

Three `@fontsource` packages added to `frontend/package.json`:

- `@fontsource-variable/geist` — UI primary
- `@fontsource/instrument-serif` — editorial italic (e.g. Recents greeting)
- `@fontsource-variable/jetbrains-mono` — metadata, sizes, timestamps

Imported only from `v2.scss`. Classic stays on its current Inter stack.

### Icon set

The design uses a cohesive 1.5px-stroke SVG icon set (`icons.jsx`: chevLeft, chevRight, chevDown, folder, clock, box, share, person, arrowUp, link, trash, search, settings, pencil, bell, flag, info, shareTree, comment, image, video, doc, sheet, deck, pdf, code, audio, archive, play, plus, upload, more, filter). FontAwesome's visual weight doesn't match. All glyphs are reimplemented as a `IconsV2Component` under `custom-v2/icons/`, size + color via `@Input`.

### Densities & dimensions

40px title bar · 48px app rail · 180px left nav · 40px dock rail — hardcoded but exposed as CSS vars for future tweaks. Radii ladder 5/8/12/18. Shadow ladder (shadow1/2/3) matches the JSX tokens.

## 4 · Chrome components

### `LayoutV2Component`

The v2 root. Adds `.v2-root` class to its host, sets up the 4-zone layout (title bar across top; app rail + left nav + content + dock rail left-to-right), owns the dock-active state, and renders `<router-outlet>` in the content slot. Subscribes to the same `LayoutService` as classic for viewport/theme events, but does **not** reuse classic's `body`-class toggles (`sidebar-collapse`, `control-sidebar-open`) — v2 has its own collapse state on the host component.

### `TitleBarComponent`

Height 40px, flat plum `--si-chrome-bg`. Left-to-right: 168px brand block (conic-gradient `LogoComponent` + "Sync-In" / "FILES" eyebrow) → back/forward nav icon buttons → breadcrumb strip → right-edge slot (`rightBadge` content projection, for the future transfers pill) + user avatar.

Breadcrumb data comes from a new `BreadcrumbService` with a `setBreadcrumbs(segments: { label, icon?, route? }[])` method. Screens push into it on activation.

### `AppRailComponent`

48px vertical rail, 4 entries: Files (active) · Search · People · Settings. Each = 34px icon button with a 2.5px left accent bar when active. In milestone 2 only Files routes anywhere; the others render but are `disabled` with tooltip "Not migrated yet." No invented content.

### `LeftNavComponent`

180px. Two sections with small uppercase labels (WORKSPACE / SHARED):

- **Workspace**: Recents / Personal / Spaces
- **Shared**: collapsible group with With me / With others / Via links
- Divider → Trash
- Bottom user card (avatar + display name + `used/quota` monoline from `UserService`)
- Footer: AGPL §13 source link ("Source: github.com/zjean/server") — discharges the network-clause obligation for v2.

Active state uses `--si-nav-soft` background + 2.5px glowing indigo bar on the left edge. Uses `routerLink` + `routerLinkActive`. Routes for unmigrated destinations (Spaces, Shared sub-items, Trash) render the target but the screen itself shows a "Not migrated yet — open in classic UI" placeholder.

### `DockRailComponent`

40px right rail, 6 toggleable tabs (pencil, bell, flag, info, shareTree, comment). Emits `(dockChange)`. Milestone-2 screens only wire `info`; the other tabs light up but open an empty "Coming soon" panel.

## 5 · First-milestone screens

### Recents — `/v2/recents`

Two-panel layout, matches the real product structure.

- **Left panel (~60%)**: "Files" header with count + search icon-button. Each row = `FileGlyph` (type-colored) + filename (with subfolder breadcrumb eyebrow) + right-aligned relative time in JetBrains Mono. Data from existing `RecentsService`. Click:
  - Image → `/v2/viewer?id=…`
  - Folder → `/v2/personal?path=…`
  - Other → fall through to classic `files` route for m2 (graceful degradation).
- **Right panel (~40%)**: "Comments" header + count. Rows = Avatar + author + file glyph + excerpt + time. Data from existing `CommentsService` if a recent-comments feed exists. If no feed is exposed, the panel shows the stripped-back "No recent comments" empty state — no invented data.
- **Editorial greeting above both panels**: "Good morning, \<name>" in Instrument Serif italic. Name from `UserService`. No invented stat cards, no pinned row.

### Personal browser — list view — `/v2/personal[/**]`

- **Toolbar left**: refresh · new · upload · share · more (mirrors current product).
- **Toolbar right**: `Filter ⌘F` search input + column-settings icon.
- **Breadcrumbs**: pushed into `BreadcrumbService` on route activation, rendered by the shared title bar.
- **Columns**: Name · Info · Size · Modified (matching real product). Name cell = `FileGlyph` + filename. Info cell shows comment-count pill if present. Modified as subtle warm-tinted pill in JetBrains Mono.
- **Selection**: checkbox gutter appears on row hover. Selection toolbar replaces normal toolbar when ≥1 row selected.
- **States**: empty state + loading skeleton.
- **Grid / gallery**: toggles **rendered but disabled** with tooltip "Coming next". Segment positions are reserved so milestone 3 can drop them in without layout shift.

### Viewer — `/v2/viewer`

Dedicated dark canvas. Prev/next/play/fullscreen/info controls overlaid on the canvas. Opens image by `id` query param via `FilesService.getById`. Right `info` dock opens metadata panel reusing the existing file-info service. Keyboard: `←`/`→` to navigate siblings in the opener's list context; `Esc` closes back to referrer (Recents or Personal).

## 6 · Build sequence (PRs)

Each PR is an independent feature branch off `main`, merged via squash. `test` status check must pass; all PR conversations resolved before merge. All v2 code lives under `custom-v2/` so weekly upstream syncs land cleanly.

| # | Branch | Contents | Est. LOC |
|---|---|---|---|
| 1 | `feat/v2-scaffold` | Empty `custom-v2/` skeleton, `/v2` route with a stub "Sync-In v2 — coming soon" page, `.v2-root` class wired up, tokens SCSS, three font packages, opt-in toggles in classic navbar user menu. | ~200 |
| 2 | `feat/v2-icons-and-primitives` | `IconsV2Component` with all ~30 SVGs. `AvatarComponent`, `AvatarStackComponent`, `FileGlyphComponent`, `LogoComponent`, `PillComponent`, `ButtonComponent`, `IconButtonComponent`. Visual showcase route `/v2/_kit` for review. | ~500 |
| 3 | `feat/v2-chrome` | `LayoutV2Component` + title bar + app rail + left nav + dock rail + `BreadcrumbService`. Routes still render stubs. | ~600 |
| 4 | `feat/v2-recents` | Recents screen wired to `RecentsService` + `CommentsService`. | ~300 |
| 5 | `feat/v2-personal-list` | Personal browser list view wired to `FilesService`: breadcrumb navigation, multi-select, toolbar, selection toolbar, empty/loading states. | ~700 |
| 6 | `feat/v2-viewer` | Image viewer: keyboard + overlay controls, info dock. | ~300 |

After each PR, `/v2` remains usable — unmigrated screens render placeholders until their PR lands.

## 7 · Risks and mitigations

- **Service shape surprises** — `RecentsService` / `CommentsService` may not expose the shape the design assumes. *Mitigation*: spike the service contract at the start of each screen PR; if there's a gap, add a thin adapter inside `custom-v2/adapters/` or trim the design to match real data. Never invent.
- **`oklch()` browser support** — Safari <15.4 doesn't parse `oklch()`. *Mitigation*: tokens SCSS emits hex/rgb fallbacks alongside `oklch()`; verify against the fork's supported-browser matrix before merging the tokens PR.
- **Upstream drift during build** — each PR is small and merged promptly to avoid long-lived branches. Weekly `upstream-sync.yml` only touches upstream files, not `custom-v2/` — collisions near-zero.
- **AGPL §13 source link** — v2 must preserve or add the source-link to `github.com/zjean/server` somewhere visible. Placed in the user card footer of `LeftNavComponent`.
- **i18n** — all v2 strings use the `custom.` prefix. Translation keys added to `src/app/i18n/` per existing pattern.

## 8 · What's next

- This document is approved; implementation follows PR sequence in § 6.
- After milestone 2 (PRs 1–6) lands, a milestone-3 plan will cover: Spaces, Shared, Trash, File detail page, Transfers popover, grid/gallery views, Search, Settings, People.
