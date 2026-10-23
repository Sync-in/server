# Relative images in Markdown

Images resolve from the current document's directory in the same Sync-in repository and space/share:

```text
project/
  overview.md
  images/diagram.png
  notes/detail.md
```

In `overview.md`:

```markdown
![Diagram](images/diagram.png)
```

In `notes/detail.md`:

```markdown
![Diagram](../images/diagram.png)
```

For spaces in filenames, use `![Photo](images/my%20photo.png)` or `![Photo](<images/my photo.png>)`.
In visual edit mode, choose **Image → Image from relative path**, enter the path, and optionally add alternative text.
This references an existing file; it does not upload or embed a copy.

## Behavior and limits

- `./` and `../` are normalized, but cannot leave the repository and space/share. Server-side root permissions remain authoritative.
- Images use the existing authenticated file endpoint. Missing or inaccessible images show a broken-image/alternative-text placeholder.
- Source/visual switching, saving, and editor HTML copying retain the original reference, not an API URL. Pasting into a different document resolves from that document's location.
- Existing URL and embedded images remain supported. No changes to file locking or save permissions.
- This feature does not implement relative note links, wikilinks, image uploads, vault lookup, or heading navigation.

## Verification

Run `npm -w frontend test`, `npm -w frontend run lint`, and `npm -w frontend run build` from the repository root.
The frontend tests use the workspace's existing Vitest installation. The root `npm test` includes them after the backend tests.

With a writable test directory, verify the example above in a browser. Check both filename-space forms,
source/visual switching, copy/paste, the relative-path menu, save/reopen, and a missing target.
Confirm the saved Markdown still contains relative paths and that an external or embedded image still renders.
