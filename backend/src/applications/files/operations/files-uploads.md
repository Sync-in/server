# File uploads

Files at or below the configured threshold use multipart uploads. Larger web files use resumable upload sessions: the first chunk creates the session
and the last chunk publishes the file. Each chunk uses `Content-Type: application/octet-stream` with length and offset headers.

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

`maxChunkSize` is exposed to authenticated web and sync clients through `ServerConfig.files.transfers`. `maxUploadSize` remains backend-only.

- An omitted or `undefined` `maxChunkSize` enables chunking with the 95 MB default.
- `null`, an empty YAML value, or `0` disables chunking.
- An enabled value must be an integer of at least 1,000,000 bytes.
- A file whose size is less than or equal to `maxChunkSize` uses the multipart endpoint.
- A larger web file uses an upload session and chunks no larger than `maxChunkSize`.
- Multipart requests contain at most 1,000 files and 1,000 total parts.
- When chunking is enabled, the cumulative file payload of one multipart request does not exceed `maxChunkSize`.
- The server snapshots `maxChunkSize` in the session manifest, so a configuration change does not alter an upload already in progress.

The deprecated `applications.files.maxUploadSize` key is also accepted. When both forms are configured,
`applications.files.transfers.maxUploadSize` takes precedence.

Multipart overhead is additional to the cumulative file payload. The 95 MB default leaves headroom below common 100 MB proxy request limits.

## Routes and request count

The web API uses `/api/app/spaces/operation/upload-session`; the synchronization API uses `/api/app/sync/operation/upload-session`. The destination
occupies the wildcard part of the route and the client generates a UUID v4 for `uploadId`.

| Operation | Method and relative route | Result |
| --- | --- | --- |
| Create and first chunk | `POST upload-session/:uploadId/<destination>` | Creates a new-file session and writes the body |
| Create or overwrite and first chunk | `PUT upload-session/:uploadId/<destination>` | Creates a modify-mode session and writes the body |
| Following chunk | `PATCH upload-session/:uploadId/<destination>` | Appends at the declared offset |
| Status and recovery | `HEAD upload-session/:uploadId/<destination>` | Returns the authoritative state |
| Cancel | `DELETE upload-session/:uploadId/<destination>` | Removes an active session |

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

New sessions enforce `maxUploadSize`, the current chunk-size limit, destination containment, symlink rules, create/overwrite semantics, and the full
declared size against the current quota snapshot. Every non-empty chunk rechecks quota before writing. Publication rechecks the destination path,
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
