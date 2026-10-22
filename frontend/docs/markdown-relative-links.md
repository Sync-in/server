# Relative Markdown note links

The Markdown viewer resolves standard note links against the current document's folder:

```markdown
[First note](notes/first.md)
[Sibling](./second.md)
[Parent](../index.md)
[Spaces](<notes/space note.md>)
[Encoded spaces](notes/space%20note.md)
[Heading](notes/first.md#target-heading)
[Local heading](#local-heading)
```

Click a link in read-only mode. While editing, use Ctrl-click (Windows/Linux) or Cmd-click (macOS); a normal click edits the link text. Keyboard activation follows the same read-only/editing distinction. HTTP(S) and mailto links open externally.

Linked `.md` and `.markdown` files open read-only in the existing file viewer. The source window is minimized, not closed: its unsaved changes, undo history, and edit lock remain intact. Return through a note link or the Windows Manager. A restored editor keeps its previous editing state. The browser Back button is not a note-history control.

The destination directory and file are requested through the existing authenticated endpoints; destination permissions are not copied from the source. Missing or inaccessible targets leave the current viewer open and show an error. Relative paths cannot escape the current repository and space/share alias; backend root and file permissions remain authoritative. Directory listing permission is required to resolve the target's metadata. No new backend routes or dependencies are introduced.

Heading fragments match heading text (case-insensitive, including URL-encoded spaces) or lowercase slugs with punctuation removed and spaces replaced by hyphens. Duplicate slugs use `-1`, `-2`, etc. Missing headings leave the destination document open without a jump. Links retain their original relative destinations through source/visual switching, HTML clipboard operations, and saving; destinations containing spaces or parentheses use Markdown angle brackets.

## Scope

This adds standard Markdown navigation, not Obsidian compatibility. Wikilinks, extensionless vault-wide lookup, block references, embeds, backlinks, graph views, and plugins are not implemented. Non-Markdown local targets and absolute application paths are not followed by this feature. Browser context-menu/new-tab navigation is not remapped to a Sync-in route.

PR2 builds on PR1's `resolveMarkdownRelativePath` helper. Until PR1 is merged, review this branch's incremental diff against `feat/markdown-relative-images`.

## Verification

Unit tests cover path boundaries, encoded separators, malformed escapes, multi-hop resolution, heading slugs, and repeated Markdown serialization. Browser verification should cover read-only and Ctrl/Cmd-click navigation, source editing retention, return to an existing window, spaces, fragments, missing/forbidden targets, external links, and source/visual/save round trips. Re-run the relative-image regression as well.
