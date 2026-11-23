# File uploads

Files at or below the configured threshold use multipart uploads. Larger web files use resumable upload sessions: the first chunk creates the session
and the last chunk publishes the file. Each chunk uses `Content-Type: application/octet-stream` with length and offset headers.

## Upload flow matrix

Sync-in keeps three upload transports because they address different request shapes. They share file-size and quota checks, but retain
transport-specific publication and recovery semantics.

| Feature or client                             | Upload flow    | Request model                                                                                                | Recovery model                                                                                     | Server entry point                                   |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Web client, small files and directory batches | Multipart      | One request can contain many files; the client batches payloads according to `maxChunkSize`                  | No persistent byte offset                                                                          | `FilesManager.saveMultipart()`                       |
| Web client, files larger than `maxChunkSize`  | Upload session | One initial `POST` or `PUT`, followed by sequential `PATCH` requests                                         | Persistent `uploadId`, authoritative offset through `HEAD`, explicit cancellation through `DELETE` | `FilesUploadSessionManager`                          |
| Legacy desktop compatibility path             | Single stream  | One `application/octet-stream` request per file                                                              | The complete file is retried after an ambiguous failure                                            | `SyncManager.upload()` → `FilesManager.saveStream()` |
| Desktop synchronization upload-session API    | Upload session | Raw file bytes in fast mode; file bytes followed by a binary SHA-512/256 digest in secure mode                     | Persistent `uploadId`, staged offset, and secure-mode validated offset                           | `FilesUploadSessionManager`                          |
| WebDAV `PUT`                                  | Single stream  | One stream per destination; ranged `PUT` can append from the current file size                               | Optional `Content-Range` checkpoint                                                                | `WebdavMethods.put()` → `FilesManager.saveStream()`  |

Multipart is optimized for batching many small files without one HTTP request per file. Single-stream uploads preserve compatibility with standard
protocols such as WebDAV and with legacy desktop synchronization clients. Upload sessions add persistent recovery state for updated desktop clients
and for large or explicitly chunked web files.

Multipart and single-stream uploads use `UploadStreamLimiter`. Upload sessions apply equivalent size and quota checks from their persisted manifest
and current payload offset. All quota checks use the current cached snapshot; quota capacity is not reserved atomically between concurrent uploads.

## Staging coverage

Staging means that incoming bytes are written outside the user-visible destination until the stream and the transport-specific validations complete.
It does not imply `fsync` durability, resumability, or an all-or-nothing transaction across every file in a multipart batch.

| Feature or client                                  | Staging behavior                                                                                                             | Publication and interrupted-upload behavior                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web client, small files and directory batches      | Every multipart part (`POST`, `PUT`, and `PATCH`) is written to a `server-user-<id>-upload-*` file on the target storage     | `POST` moves the staged file with overwrite disabled while holding the exclusive destination lock. `PUT` and `PATCH` move it with overwrite enabled. A batch is committed per file, not as one transaction. |
| Web upload-session API                             | Every chunk is appended to the session's `payload.part` file                                                                 | The declared size is verified before publication. The persistent `uploadId` and authoritative offset provide recovery before publication.                                                                  |
| Desktop synchronization upload-session API         | Fast chunks are appended raw; secure chunks consume a 32-byte checksum suffix that is never stored in `payload.part`          | Fast publication follows the staged offset directly. Secure publication requires both staged and validated offsets to reach the declared size.                                                            |
| Legacy desktop compatibility path                   | The complete stream is written to a managed `server-user-<id>-upload-*` file                                                 | Its declared size and optional checksum are validated before publication. The hidden staging has no legacy inter-run checkpoint, so an ambiguous failure retries the complete file.                          |
| WebDAV complete `PUT` replacing an existing file   | The complete stream is staged when no `Content-Range` is present and the destination already exists                          | The previous destination remains unchanged if streaming fails.                                                                                                                                              |
| WebDAV complete `PUT` creating a new file          | No staging                                                                                                                   | The request writes directly to the destination. A process failure can leave a partial file, but a later `PUT` may replace it.                                                                               |
| WebDAV ranged `PUT`                                | No staging by design                                                                                                         | The partial destination is the `Content-Range` checkpoint used for append-only resumption.                                                                                                                  |

Transports with a resumable checkpoint retain that state instead of deleting it after a failed request. Upload sessions keep their session
payload until the client resumes, explicitly cancels the session, or scheduled expiration removes it. Ranged WebDAV uploads keep the partial
destination as their append-only checkpoint.

Non-recoverable staged uploads, including the legacy desktop compatibility path, multipart requests, and complete WebDAV overwrites, attempt to remove
their temporary file immediately after an error. Cleanup is best-effort: if deletion fails or the process stops first, scheduled temporary-file cleanup
removes managed `server-user-<id>-*` artifacts after expiration.

`temporaryRootFromSpace()` selects a temporary root on the destination storage so normal publication uses a same-filesystem rename. If the process
stops before that rename, the destination is absent and the scheduler later removes the managed temporary entry; after the rename, only the complete
destination exists. `moveFiles()` retains its `EXDEV` copy-and-remove fallback for compatibility, but that exceptional cross-device path cannot offer
rename atomicity. Storage layouts should therefore keep the selected temporary root and destination on the same filesystem.

## Configuration and client selection

```yaml
applications:
  files:
    transfers:
      maxUploadSize: 5GB
      maxChunkSize: 95MB
```

Both options accept a byte count or a text size. Text units (`KB`, `MB`, `GB`, ...) use base 1024, are case-insensitive, and the separating space is
optional.

`maxChunkSize` is exposed to authenticated web and sync clients through `ServerConfig.files.transfers`. It is a client-side transfer hint chosen
below proxy request limits, not a backend upload limit. `maxUploadSize` remains backend-only.

- An omitted or `undefined` `maxChunkSize` enables chunking with the 95 MB default.
- `null`, an empty YAML value, or `0` disables chunking in the bundled clients.
- An enabled value must be an integer of at least 1,000,000 bytes.
- A file whose size is less than or equal to `maxChunkSize` uses the multipart endpoint.
- A larger web file uses an upload session and the client targets chunks no larger than `maxChunkSize`.
- Multipart requests contain at most 1,000 files and 1,000 total parts.
- When chunking is enabled, the bundled clients keep the cumulative file payload of one multipart request within `maxChunkSize`.
- The backend does not reject multipart payloads or upload-session chunks that exceed `maxChunkSize`; infrastructure request limits still apply.
- Upload-session endpoints remain available to API clients when bundled-client chunking is disabled.

The deprecated `applications.files.maxUploadSize` key is also accepted. When both forms are configured,
`applications.files.transfers.maxUploadSize` takes precedence.

Multipart overhead is additional to the cumulative file payload. A secure desktop synchronization chunk adds a 32-byte checksum suffix. The
95 MB default leaves headroom below common 100 MB proxy request limits.

## Upload session routes and request count

The web API uses `/api/app/spaces/operation/upload-session`; the synchronization API uses `/api/app/sync/upload-session`. The destination
occupies the wildcard part of the route and the client generates a UUID v4 for `uploadId`.

| Operation                           | Method and relative route                       | Result                                            |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Create and first chunk              | `POST upload-session/:uploadId/<destination>`   | Creates a new-file session and writes the body    |
| Create or overwrite and first chunk | `PUT upload-session/:uploadId/<destination>`    | Creates a modify-mode session and writes the body |
| Following chunk                     | `PATCH upload-session/:uploadId/<destination>`  | Appends at the declared offset                    |
| Status and recovery                 | `HEAD upload-session/:uploadId/<destination>`   | Returns the authoritative state                   |
| Cancel                              | `DELETE upload-session/:uploadId/<destination>` | Removes an active session                         |

A file split into `N` chunks produces `N` data requests. `HEAD` reconciles an ambiguous response, and `DELETE` cancels a session.

`POST` selects creation-only mode and requires `ADD`; publication fails if the destination exists. `PUT` selects overwrite mode, requires `MODIFY`,
and may create or replace the destination. The client-generated UUID makes the first request recoverable.

## Chunk contract

Every web upload-session `POST`, `PUT`, and `PATCH` body uses:

```http
Content-Type: application/octet-stream
Content-Length: <file bytes in this request body>
upload-length: <complete file size>
upload-offset: <offset of the first body byte>
```

`upload-length` is required on every chunk and is immutable for one upload identifier. The first request requires `upload-offset: 0`. Chunks are
strictly sequential; parallel and out-of-order writes are not supported.

The synchronization route uses the same offset headers and selects an immutable transfer mode from the first request:

- without `upload-checksum`, fast mode sends raw file bytes;
- with `upload-checksum`, secure mode frames every nonempty logical chunk as:

```text
[new file bytes][32-byte binary SHA-512/256 digest]
```

In fast mode, `Content-Length` is the number of file bytes and no hash is calculated by either peer. In secure mode, `Content-Length` includes the
32-byte digest while `upload-length`, `upload-offset`, quota accounting, and response offsets count file bytes only. The digest covers the complete
logical range from the previous validated offset to the new offset. After an interrupted request this therefore includes the retained prefix already
present in staging as well as the newly transmitted bytes. The suffix is never written to `payload.part`.

The synchronization route additionally accepts these optional headers on the first request:

```http
upload-checksum: <64-character SHA-512/256 hexadecimal checksum>
upload-mtime: <Unix timestamp in seconds>
```

`upload-checksum` selects secure mode, identifies the complete source file, and is normalized to lowercase. The desktop calculates the full checksum
and the fixed-boundary chunk digests in the same source-file pass. The backend validates each transferred range against those chunk digests instead
of rereading the complete staged file before publication. When the header is absent, the immutable session mode is fast/raw. `upload-mtime` is applied
at publication in both modes.

A successful `POST` or `PUT` returns `201 Created`. `PATCH`, `HEAD`, and `DELETE` return `204 No Content`. Successful chunk and status responses include:

```http
upload-length: <complete file size>
upload-offset: <authoritative persisted offset>
upload-state: uploading | ready | complete
```

Synchronization chunk and status responses additionally include:

```http
upload-validated-offset: <contiguous accepted or checksum-validated file bytes>
```

In fast mode this header is computed directly from the staged payload and always equals `upload-offset`; it does not cause a separate state write.
Only secure mode can return a validated offset behind the staged offset.

Complete synchronization responses also include `upload-ino: <published inode>`.

The states mean:

- `uploading`: fewer than `upload-length` bytes are staged, or a secure synchronization payload contains an unvalidated trailing range.
- `ready`: every byte is staged and validated, but publication did not complete; the client can retry publication without resending data.
- `complete`: the destination was published and the session was removed. This state is returned only by the publishing request.

When a web or fast synchronization chunk reaches `upload-length`, the request applies its normal completion checks and publishes the staged payload.
A secure synchronization request first compares its digest suffix, atomically advances the validated offset, then applies the optional mtime,
acquires the destination lock, and publishes only when both offsets equal `upload-length`.

A zero-length `PATCH` with `upload-offset === upload-length` retries publication of a `ready` session. A zero-byte file uses one zero-length `POST` or
`PUT` with both upload headers set to zero. These empty requests do not carry a checksum suffix because they contain no range to validate.

Missing or malformed headers return `400 Bad Request`; a wrong offset or immutable-length mismatch returns `409 Conflict`; an oversized body returns
`413 Payload Too Large`; a busy session or destination returns `423 Locked` with `Retry-After`; quota exhaustion returns `507 Insufficient Storage`.
Offset conflicts also expose the current `upload-offset` response header. A secure synchronization checksum conflict truncates only the unvalidated
range; a mismatch with the precomputed source digest is terminal and returns `400 Bad Request`. Fast mode has no checksum conflict because it performs
no hashing.

If a connection ends after only a prefix of a chunk has been written, that prefix remains staged. The actual `payload.part` size becomes the next
authoritative upload offset. Fast mode resumes directly from that offset without rereading or hashing the retained prefix. In secure mode, the
validated offset does not advance until the complete digest arrives and matches; the backend rehashes only the retained range after that offset before
continuing the same logical chunk, while the desktop reuses the digest precomputed for the complete fixed-boundary range. A successful chunk response
means the complete request body was consumed and its resulting size was verified; secure responses additionally acknowledge checksum validation.
Writes are not synchronized with `fsync`; acknowledged durability follows the operating system and filesystem guarantees.

## Session storage and publication

Sessions use an actor-specific temporary directory:

```text
<temporary-root>/server-user-<actorId>-upload-<uploadId>-session/
├── session.json    # immutable destination, method, length, transfer mode and optional sync metadata
├── state.json      # secure-sync-only mutable format version and validated offset
├── payload.part    # staged file bytes while uploading or ready
└── write.lock      # exclusive short-lived operation lock
```

`state.json` is created only for secure synchronization sessions. It is replaced atomically after a digest matches and is never updated for an
incomplete or invalid chunk. Fast synchronization sessions derive both response offsets from `payload.part` and perform no additional state write.
`session.json` remains immutable, so its modification time continues to anchor the seven-day absolute lifetime.

```json
{"version": 1, "validatedOffset": 199229440}
```

`payload.part` is moved to the destination during publication, then the session directory is removed before the final response. Once the move has
succeeded, later metadata or event errors still trigger that removal. A cleanup failure is logged and left to the scheduler; it never rolls back the
published destination or replaces an otherwise successful response with a cleanup error. After normal cleanup, subsequent `HEAD`, `PATCH`, and
`DELETE` requests find no session; `DELETE` remains idempotent and never removes the published destination.

The shared filesystem remains the source of truth. `write.lock` serializes create resumption, append, publication, status, cancellation, and cleanup
across instances sharing the same staging storage. A competing operation receives `423 Locked`. An abandoned lock is not reclaimed by another request;
the scheduler removes it with the expired session.

Active sessions become eligible for normal cleanup after 24 hours of inactivity, and the daily cleanup schedule means effective retention can
approach 48 hours. The seven-day absolute lifetime still applies independently of recent activity. Every instance must mount staging and destination
storage at the same absolute paths.

If the final response is lost after publication, the session endpoint cannot distinguish the completed upload from a missing session. The current
attempt ends on `404`; the published destination remains the source of truth.

## Validation, quota, and permissions

New sessions enforce `maxUploadSize`, destination containment, symlink rules, create/overwrite semantics, and the full declared size against the
current quota snapshot. Every non-empty chunk rechecks quota using file bytes only; a secure synchronization digest suffix is excluded. Publication
rechecks the destination path, the method-level permission (`ADD` for `POST`, `MODIFY` for `PUT`), trash restrictions, and destination lock before
moving the file.

Staged bytes live on the target storage and are included by quota scans. Quota is not reserved atomically across concurrent uploads.

## Web client behavior

The web client snapshots `maxChunkSize` when it builds an upload batch. It groups files by top-level destination and splits multipart files into batches
of at most 1,000 files and `maxChunkSize` payload bytes. Every batch uses `POST` for creation-only uploads or `PUT` when overwrite was selected. Larger
files use upload sessions:

1. Generate one UUID and one encoded destination URL.
2. Send the first slice with `POST` or `PUT` and `upload-offset: 0`.
3. Send following slices with `PATCH` and the confirmed server offset.
4. Finish when the response state is `complete`.

After transport status `0`, `409`, `423`, or a retryable `5xx` response other than `507`, the client performs bounded recovery through `HEAD`:

- `404` after an unconfirmed first request means the session was not created, so the first chunk is retried.
- `404` after an established session is terminal for the current upload and may indicate a lost final response.
- `uploading` resumes from the returned offset, including from the middle of a previously interrupted chunk.
- `ready` sends the empty publication-retry `PATCH`.

`507` and non-retryable client errors stop the current attempt. Explicit task cancellation, logout, or an authenticated-user change aborts active
requests and pending recovery delays without issuing `DELETE`; the persisted session record is retained so a later eligible run can reconcile it
through `HEAD`, resume it, or discard it if it has become stale. The upload service owns ambiguous-response recovery; the authentication interceptor
skips its generic unavailable retry for upload-session requests.

The desktop synchronization client uses the synchronization upload-session API when the token response advertises `capabilities.transfers`.
It persists the upload identifier, immutable file metadata, local source inode, and logical chunk size with the existing incomplete-transfer snapshot.
The inode is used only to reject a replaced local source; remote publication reconciliation does not compare local and server inodes. The server
remains authoritative for both the staged and validated offsets after a restart. During one attempt the client pins a single source file handle for
all data chunks, so replacing the local path cannot mix two source versions. It closes that handle on every exit; in-place writes to the same inode
remain outside fast-mode integrity guarantees.

In secure mode, the checksum parser calculates the full-file checksum and fixed-boundary range digests together. If the full checksum was reused from
an earlier snapshot, the client calculates the range digests lazily before sending another data chunk and requires the newly calculated full checksum
to remain identical. A `ready` session first rechecks the local inode, size, and mtime, then sends the empty publication `PATCH` without rebuilding
chunk digests. The request suffix is therefore independent of the bytes later read for transport and detects a source mutation before publication. In
fast mode the client sends raw file bytes and performs no upload hash; the server reports `upload-validated-offset === upload-offset` without
persisting separate validation state.

After an ambiguous response, `HEAD` returns both offsets. Fast mode resumes directly from the equal staged and validated offsets. In secure mode, if
staging is ahead, the next request continues from the staged offset but its digest still covers the complete range beginning at the validated offset.
With chunking enabled, secure recovery rereads at most one logical chunk on the backend; when chunking is disabled the one logical chunk can be the
complete file. Transport failures, busy sessions, quota errors, and interrupted runs keep resumable state. A secure-mode checksum mismatch and other
non-resumable request errors cancel it.

Servers that do not advertise this capability continue to use the legacy single-request `application/octet-stream` route, which preserves compatibility
with older servers. On the current backend that route also writes into managed staging. A ranged request without a managed checkpoint is evaluated
against empty staging, so a nonzero offset is rejected. New clients select upload sessions only from the advertised capability. The synchronization
session endpoint is outside the legacy `/operation/*` wildcard so existing clients can still synchronize real paths named
`upload-session/<uuid>/...`.
