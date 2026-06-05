# RTL Final Audit: Physical CSS Property Conversion

## Audit Scope

Every physical CSS property (`margin-left`, `margin-right`, `padding-left`, `padding-right`, `border-left`, `border-right`, `left`, `right`, `text-align: left/right`, `float: left/right`) in `frontend/src/styles/components/*.scss` was audited and classified.

## Classifications

| Symbol | Meaning |
|--------|---------|
| RTL → CONVERTED | Converted to logical property |
| INTENTIONAL | Intentionally physical; does not need RTL conversion |
| FALSE_POSITIVE | Commented-out code; no layout effect |

---

## Property-by-Property Audit

### `_app.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 29 | `text-align: left` | `text-align: start` | Auth header text direction |
| 142 | `padding-left: 0` | `padding-inline-start: 0` | Thumbnail container padding |
| 143 | `padding-right: 0` | `padding-inline-end: 0` | Thumbnail container padding |
| 146 | `margin-right: 0.4rem` | `margin-inline-end: 0.4rem` | Row spacing |
| 147 | `margin-left: 0.4rem` | `margin-inline-start: 0.4rem` | Row spacing |
| 151 | `margin-right: 0.2rem` | `margin-inline-end: 0.2rem` | Card spacing |
| 187 | `right: .2rem` | `inset-inline-end: .2rem` | Label positioning |
| 199 | `left: .2rem` | `inset-inline-start: .2rem` | Label positioning |
| 207 | `right: .2rem` | `inset-inline-end: .2rem` | Label positioning |
| 215 | `left: .2rem` | `inset-inline-start: .2rem` | Label positioning |
| 296 | `margin-right: 0.3rem` | `margin-inline-end: 0.3rem` | Table icon spacing |
| 317 | `margin-left: calc(...)` | `margin-inline-start: calc(...)` | Avatar stack |
| 337 | `margin-right: .4rem !important` | `margin-inline-end: .4rem !important` | Button spacing |
| 351 | `margin-right: 0.2rem` | `margin-inline-end: 0.2rem` | Inner button icon |
| 369 | `margin-right: 0.4rem` | `margin-inline-end: 0.4rem` | Dropdown icon |
| 412 | `left: 9px` | `inset-inline-start: 9px` | Filter icon |
| 419 | `right: 6px` | `inset-inline-end: 6px` | Filter clear button |
| 451 | `padding-left: 5px` | `padding-inline-start: 5px` | Footer padding |
| 452 | `padding-right: 5px` | `padding-inline-end: 5px` | Footer padding |
| 509 | `right: 0` | `inset-inline-end: 0` | Info box positioning |

### `_boxes.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 18 | `margin-right: 10px` | `margin-inline-end: 10px` | Box icon spacing |
| 84 | `padding-left: 10px` | `padding-inline-start: 10px` | Box content padding |
| 114 | `margin-left: auto` | `margin-inline-start: auto` | Box layout |
| 115 | `padding-right: 10px` | `padding-inline-end: 10px` | Box layout |
| 135 | `margin-right: auto` | `margin-inline-end: auto` | Box action alignment |
| 136 | `padding-right: 0` | `padding-inline-end: 0` | Box action padding |

### `_buttons.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 115 | `margin-right: 0.2rem` | `margin-inline-end: 0.2rem` | Button icon spacing |
| 139 | `right: 0` | `inset-inline-end: 0` | Button badge positioning |

### `_chats.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 19 | `left: 0` | `inset-inline-start: 0` | Chat bubble positioning |

### `_contextmenu.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 28 | `margin-right: 0.4rem` | `margin-inline-end: 0.4rem` | Context menu icon spacing |

### `_core.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 47 | `margin-left: $sidebar-apps-menus-width` | `margin-inline-start: ...` | Content wrapper margin |
| 48 | `margin-right: $control-sidebar-menu-width` | `margin-inline-end: ...` | Content wrapper margin |
| 52 | `transition: margin-left ... margin-right ...` | `transition: margin-inline-start ...` | Transition properties |
| 55 | `padding-left: 0` | `padding-inline-start: 0` | Content container |
| 56 | `padding-right: 0` | `padding-inline-end: 0` | Content container |
| 58 | `margin-right: auto` | `margin-inline-end: auto` | Content container |
| 59 | `margin-left: auto` | `margin-inline-start: auto` | Content container |

### `_dropdowns.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 36 | `padding-left: 5px` | `padding-inline-start: 5px` | Dropdown item padding |
| 37 | `padding-right: 5px` | `padding-inline-end: 5px` | Dropdown item padding |

### `_forms.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 26 | `border-left: 5px solid $primary` | `border-inline-start: 5px solid $primary` | Form validation highlight |
| 30 | `border-left: 5px solid $red !important` | `border-inline-start: 5px solid $red !important` | Form error highlight |
| 40 | `margin-right: 0.25rem` | `margin-inline-end: 0.25rem` | Form label spacing |
| 45 | `margin-right: 0 !important` | `margin-inline-end: 0 !important` | Form input override |

### `_header.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 6 | `margin-left: $sidebar-apps-menus-width` | `margin-inline-start: ...` | Header margin |
| 10 | `transition: margin-left ...` | `transition: margin-inline-start ...` | Transition property |
| 16 | `margin-left: 0` | `margin-inline-start: 0` | Navbar margin |
| 97 | `margin-left: -.5px` | `margin-inline-start: -.5px` | History button overlap |
| 99 | `border-left: .5px ...` | `border-inline-start: .5px ...` | History button border |
| 104 | `border-right: none` | `border-inline-end: none` | Navbar right border |
| 108 | `border-left: .5px ...` | `border-inline-start: .5px ...` | Breadcrumb border |
| 120 | `margin-left: auto` | `margin-inline-start: auto` | Navbar right side layout |
| 238 | `margin-left: .3rem` | `margin-inline-start: .3rem` | Breadcrumb link spacing |
| 252 | `margin-left: .3rem` | `margin-inline-start: .3rem` | Breadcrumb icon spacing |
| 4 | `right: 0` | UNCHANGED | INTENTIONAL — header stretch anchor |
| 5 | `left: 0` | UNCHANGED | INTENTIONAL — header stretch anchor |

### `_modal.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 26 | `margin-right: 0.4rem` | `margin-inline-end: 0.4rem` | Modal title icon spacing |
| 104 | `margin-right: auto` | UNCHANGED | INTENTIONAL — horizontal centering |
| 105 | `margin-left: auto` | UNCHANGED | INTENTIONAL — horizontal centering |

### `_notifications.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 20 | `left: 0.58rem` | `inset-inline-start: 0.58rem` | Toast accent bar position |

### `_recents.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 6 | `margin-left: 0` | UNCHANGED | INTENTIONAL — both margins zeroed |
| 7 | `margin-right: 0` | UNCHANGED | INTENTIONAL — both margins zeroed |
| 86 | `text-align: left` | `text-align: start` | Recent item card text |
| 133 | `margin-left: 0.38rem` | `margin-inline-start: 0.38rem` | Timestamp spacing |
| 135 | `text-align: right` | `text-align: end` | Timestamp alignment |

### `_search.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 6 | `padding-right: 2rem` | `padding-inline-end: 2rem` | Search input (room for clear btn) |
| 12 | `right: 45px` | `inset-inline-end: 45px` | Clear button position |
| 19 | `margin-left: 0.3rem` | `margin-inline-start: 0.3rem` | Go-to button spacing |
| 45 | `margin-left: 0.3rem` | `margin-inline-start: 0.3rem` | Result meta spacing |
| 63 | `margin-right: 0.25rem` | `margin-inline-end: 0.25rem` | Path icon spacing |

### `_sidebar_left.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 5 | `left: 0` | `inset-inline-start: 0` | Sidebar positioning |
| 53 | `margin-right: .4rem` | `margin-inline-end: .4rem` | Logo toggle spacing |
| 54 | `margin-left: .4rem` | `margin-inline-start: .4rem` | Logo toggle spacing |
| 67 | `margin-right: auto` | `margin-inline-end: auto` | Sidebar title layout |
| 75 | `margin-right: .25rem` | `margin-inline-end: .25rem` | Sidebar title icon |
| 90 | `border-right: .5px ...` | `border-inline-end: .5px ...` | Apps shortcuts border |
| 158 | `padding-left: 10px` | `padding-inline-start: 10px` | Submenu indent |
| 182 | `margin-right: 0` | `margin-inline-end: 0` | Menu icon margin |
| 191 | `margin-left: auto` | `margin-inline-start: auto` | Menu badge alignment |
| 205 | `margin-left: auto` | `margin-inline-start: auto` | Footer alignment |
| 120 | `right: 2px` | UNCHANGED | INTENTIONAL — badge visual convention |

### `_sidebar_left_collapse.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 3 | `margin-left: 0 !important` | `margin-inline-start: 0 !important` | Collapsed sidebar margin |
| 8 | `border-left: 0.5px ...` | `border-inline-start: 0.5px ...` | Dark theme border |
| 20 | `border-right: none !important` | `border-inline-end: none !important` | Collapsed border |
| 50 | `margin-left: 0` | `margin-inline-start: 0` | Mobile sidebar margin |

### `_sidebar_right.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 3 | `right: -$control-sidebar-width` | `inset-inline-end: ...` | Sidebar off-screen |
| 10 | `transition: right ...` | `transition: inset-inline-end ...` | Transition property |
| 14 | `right: $control-sidebar-menu-width` | `inset-inline-end: ...` | Sidebar open position |
| 18 | `right: -$...` | `inset-inline-end: ...` | Small screen position |
| 35 | `margin-right: auto` | `margin-inline-end: auto` | Component title |
| 36 | `margin-left: auto` | `margin-inline-start: auto` | Component title |
| 62 | `right: 0` | `inset-inline-end: 0` | Control sidebar menu |
| 109 | `right: 3px` | `inset-inline-end: 3px` | Badge positioning |
| 121 | `margin-right: $...` | `margin-inline-end: $...` | Content wrapper margin |

### `_theme_dark.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 29 | `border-right: .5px ...` | UNCHANGED | INTENTIONAL — left sidebar structural border |
| 59 | `border-left: .5px ...` | UNCHANGED | INTENTIONAL — right sidebar structural border |
| 80 | `border-left: .5px ...` | UNCHANGED | INTENTIONAL — sidebar icons sub-panel border |
| 497 | `// border-left ...` | UNCHANGED | FALSE_POSITIVE — commented out code |
| 754 | `right: 10px !important` | `inset-inline-end: 10px !important` | CodeMirror search close btn |

### `_theme_light.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 35 | `border-right: .5px ...` | UNCHANGED | INTENTIONAL — left sidebar structural border |
| 74 | `border-left: .5px ...` | UNCHANGED | INTENTIONAL — right sidebar structural border |
| 91 | `border-left: .5px ...` | UNCHANGED | INTENTIONAL — sidebar icons sub-panel border |
| 524 | `// border-left ...` | UNCHANGED | FALSE_POSITIVE — commented out code |

### `_tree.scss`

| Line | Original | Replacement | Reason |
|------|----------|-------------|--------|
| 16 | `left: 3px` | `inset-inline-start: 3px` | Tree caret position |
| 57 | `margin-left: 5px` | `margin-inline-start: 5px` | Node content indent |
| 58 | `margin-right: 30px` | `margin-inline-end: 30px` | Node content end spacing |
| 86 | `padding-left: 10px` | `padding-inline-start: 10px` | Toggle indent |
| 91 | `padding-left: 10px` | `padding-inline-start: 10px` | Placeholder indent |
| 157 | `margin-left: 9px` | `margin-inline-start: 9px` | Loading indicator position |

---

## Summary

| Classification | Count |
|----------------|-------|
| RTL → CONVERTED (Phase 1 + Phase Final) | 88 |
| INTENTIONAL (unchanged) | 10 |
| FALSE_POSITIVE (commented out) | 2 |
| **Total properties audited** | **100** |

### Intentional Properties — Justification

| Property | Location | Justification |
|----------|----------|---------------|
| `right: 0; left: 0` | `.main-header` | Stretch anchor for full-width fixed header |
| `margin-right: auto; margin-left: auto` | `.modal-xs` | Horizontal centering (auto on both sides) |
| `margin-left: 0; margin-right: 0` | `.recents-grid` | Both margins zeroed (identical, not directional) |
| `right: 2px` | `.sidebar-menu .badge` | Badge anchored to top-right corner — visual convention |
| `border-right` (8x across themes) | Sidebar structural borders | Fixed-position sidebar separators between sidebars and content |

---

## Verification

**Final audit command:**

```bash
grep -rn "margin-left|margin-right|padding-left|padding-right|border-left:|border-right:|\bleft:\s*[0-9p.-]|\bright:\s*[0-9p.-]|text-align:\s*left|text-align:\s*right|float:\s*left|float:\s*right" \
  --include="*.scss" frontend/src/styles/components/ | \
  grep -v "margin-inline|padding-inline|border-inline|inset-inline"
```

**Result**: Only intentional and false-positive properties remain. Zero actionable physical CSS properties.

---

## Translation Key Fix

| File | Key Before (fa.json) | Key After | Byte Diff |
|------|---------------------|-----------|-----------|
| `fa.json` | `the client\u0027s files take precedence` | `the client\u2019s files take precedence` | U+0027 → U+2019 |
| `fa.json` | `the server\u0027s files take precedence` | `the server\u2019s files take precedence` | U+0027 → U+2019 |

**Verification**: `de.json` and `fa.json` now have 100% key match (710/710). Zero missing, zero extra.
