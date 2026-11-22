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
| Desktop synchronization client                | Single stream  | One `application/octet-stream` request per file                                                              | The complete file is retried after an ambiguous failure                                            | `SyncManager.upload()` → `FilesManager.saveStream()` |
| Synchronization upload-session API            | Upload session | Same chunk protocol as the web session API, with optional checksum and mtime metadata                        | Persistent `uploadId` and offset                                                                   | `FilesUploadSessionManager`                          |
| WebDAV `PUT`                                  | Single stream  | One stream per destination; ranged `PUT` can append from the current file size                               | Optional `Content-Range` checkpoint                                                                | `WebdavMethods.put()` → `FilesManager.saveStream()`  |

Multipart is optimized for batching many small files without one HTTP request per file. Single-stream uploads preserve compatibility with standard
protocols such as WebDAV and with the current desktop synchronization client. Upload sessions add persistent recovery state for large or explicitly
chunked files.

Multipart and single-stream uploads use `UploadStreamLimiter`. Upload sessions apply equivalent size and quota checks from their persisted manifest
and current payload offset. All quota checks use the current cached snapshot; quota capacity is not reserved atomically between concurrent uploads.

## Staging coverage

Staging means that incoming bytes are written outside the user-visible destination until the stream and the transport-specific validations complete.
It does not imply `fsync` durability, resumability, or an all-or-nothing transaction across every file in a multipart batch.

| Feature or client                                  | Staging behavior                                                                                                             | Publication and interrupted-upload behavior                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web client, small files and directory batches      | Every multipart part (`POST`, `PUT`, and `PATCH`) is written to an actor-specific `~tmp-upload-*` file on the target storage | `POST` moves the staged file with overwrite disabled while holding the exclusive destination lock. `PUT` and `PATCH` move it with overwrite enabled. A batch is committed per file, not as one transaction. |
| Web client and synchronization upload-session APIs | Every chunk is appended to the session's `payload.part` file                                                                 | The declared size and optional checksum are verified before publication. The persistent `uploadId` and authoritative offset provide recovery before publication.                                            |
| Desktop synchronization client                     | The complete stream is written to a `.sync-in.*` file and its declared size and optional checksum are validated              | The staged file is moved into place after validation. An ambiguous failure retries the complete file.                                                                                                       |
| WebDAV complete `PUT` replacing an existing file   | The complete stream is staged when no `Content-Range` is present and the destination already exists                          | The previous destination remains unchanged if streaming fails.                                                                                                                                              |
| WebDAV complete `PUT` creating a new file          | No staging                                                                                                                   | The request writes directly to the destination. A process failure can leave a partial file, but a later `PUT` may replace it.                                                                               |
| WebDAV ranged `PUT`                                | No staging by design                                                                                                         | The partial destination is the `Content-Range` checkpoint used for append-only resumption.                                                                                                                  |

Transports with a resumable checkpoint retain that state instead of deleting it after a failed request. Upload sessions keep their session
payload until the client resumes, explicitly cancels the session, or scheduled expiration removes it. Ranged WebDAV uploads keep the partial
destination as their append-only checkpoint.

Non-recoverable staged uploads, including multipart requests and complete WebDAV overwrites, attempt to remove their temporary file immediately
after an error. Cleanup is best-effort: if deletion fails or the process stops first, scheduled temporary-file cleanup removes managed `~tmp-*`
artifacts after expiration.

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

Multipart overhead is additional to the cumulative file payload. The 95 MB default leaves headroom below common 100 MB proxy request limits.

## Upload session routes and request count

The web API uses `/api/app/spaces/operation/upload-session`; the synchronization API uses `/api/app/sync/operation/upload-session`. The destination
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

Every `POST`, `PUT`, and `PATCH` body uses:

```http
Content-Type: application/octet-stream
Content-Length: <bytes in this request body>
Upload-Length: <complete file size>
Upload-Offset: <offset of the first body byte>
```

`Upload-Length` is required on every chunk and is immutable for one upload identifier. The first request requires `Upload-Offset: 0`. Chunks are
strictly sequential; parallel and out-of-order writes are not supported.

The sync route additionally accepts these optional headers on the first request:

```http
Upload-Checksum: <64-character SHA-512/256 hexadecimal checksum>
Upload-Mtime: <Unix timestamp in seconds>
```

The checksum covers the complete file. It is normalized to lowercase and verified once the last byte is staged.

A successful `POST` or `PUT` returns `201 Created`. `PATCH`, `HEAD`, and `DELETE` return `204 No Content`. Successful chunk and status responses include:

```http
Upload-Length: <complete file size>
Upload-Offset: <authoritative persisted offset>
Upload-State: uploading | ready | complete
```

Complete sync responses also include `Upload-Ino: <published inode>`.

The states mean:

- `uploading`: fewer than `Upload-Length` bytes are staged.
- `ready`: every byte is staged, but publication did not complete; the client can retry publication without resending data.
- `complete`: the destination was published and the session was removed. This state is returned only by the publishing request.

When a chunk reaches `Upload-Length`, the request validates the optional checksum, applies the optional mtime, acquires the destination lock, and
publishes the staged payload.

A zero-length `PATCH` with `Upload-Offset === Upload-Length` retries publication of a `ready` session. A zero-byte file uses one zero-length `POST` or
`PUT` with both upload headers set to zero.

Missing or malformed headers return `400 Bad Request`; a wrong offset or immutable-length mismatch returns `409 Conflict`; an oversized body returns
`413 Payload Too Large`; a busy session or destination returns `423 Locked` with `Retry-After`; quota exhaustion returns `507 Insufficient Storage`.
Offset conflicts also expose the current `Upload-Offset` response header.

If a connection ends after only a prefix of a chunk has been written, that prefix remains valid. The actual `payload.part` size becomes the next
authoritative offset. A successful chunk response means the complete request body was consumed and its resulting size was verified. Writes are not
synchronized with `fsync`; acknowledged durability follows the operating system and filesystem guarantees.

## Session storage and publication

Sessions use an actor-specific temporary directory:

```text
<temporary-root>/~tmp-upload-<uploadId>-session/
├── session.json    # immutable destination, method, length, chunk limit and optional sync metadata
├── payload.part    # staged bytes while uploading or ready
└── write.lock      # exclusive short-lived operation lock
```

`payload.part` is moved to the destination during publication, then the session directory is removed before the final response. Subsequent `HEAD`,
`PATCH`, and `DELETE` requests therefore find no session; `DELETE` remains idempotent and never removes the published destination.

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
current quota snapshot. Every non-empty chunk rechecks quota before writing. Publication rechecks the destination path,
the method-level permission (`ADD` for `POST`, `MODIFY` for `PUT`), trash restrictions, and destination lock before moving the file.

Staged bytes live on the target storage and are included by quota scans. Quota is not reserved atomically across concurrent uploads.

## Web client behavior

The web client snapshots `maxChunkSize` when it builds an upload batch. It groups files by top-level destination and splits multipart files into batches
of at most 1,000 files and `maxChunkSize` payload bytes. Every batch uses `POST` for creation-only uploads or `PUT` when overwrite was selected. Larger
files use upload sessions:

1. Generate one UUID and one encoded destination URL.
2. Send the first slice with `POST` or `PUT` and `Upload-Offset: 0`.
3. Send following slices with `PATCH` and the confirmed server offset.
4. Finish when the response state is `complete`.

After transport status `0`, `409`, `423`, or a retryable `5xx` response other than `507`, the client performs bounded recovery through `HEAD`:

- `404` after an unconfirmed first request means the session was not created, so the first chunk is retried.
- `404` after an established session is terminal for the current upload and may indicate a lost final response.
- `uploading` resumes from the returned offset, including from the middle of a previously interrupted chunk.
- `ready` sends the empty publication-retry `PATCH`.

`507` and non-retryable client errors are terminal. Explicit task cancellation aborts the active request and attempts bounded `DELETE` cleanup.
Logout or authenticated-user changes cancel active uploads. The upload service owns ambiguous-response recovery; the authentication interceptor skips
its generic unavailable retry for upload-session requests.

The desktop synchronization client currently uses single-request `application/octet-stream` uploads.
