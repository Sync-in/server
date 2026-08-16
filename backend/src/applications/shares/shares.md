# Shares

The `shares` module exposes existing storage through share aliases. A share does not copy its source and does not become the owner of the underlying
storage.

## Storage provenance

The share keeps enough provenance to resolve the physical source and its managed storage owner:

| Share source                             | Storage provenance                                              |
|------------------------------------------|-----------------------------------------------------------------|
| Personal files                           | The source file's `ownerId`                                     |
| Native space                             | The source `spaceId`                                            |
| External root attached to a native space | The source `spaceId` and `spaceRootId`                          |
| External share                           | The root share's `externalPath` and `files.shareExternalId`     |
| Child of an external share               | The highest external parent and a path below its `externalPath` |

For a native-space external root, the native space remains the managed storage owner even though the files are physically outside its home.

A root external share has no managed user or native-space storage owner. Its
`ownerId` is therefore `null`. A child share can have an `ownerId` identifying the owner of the share record, but that value is not storage ownership
and must not be used to select a user trash repository.

Files indexed below an external share use `files.shareExternalId`. For a child share, this identifier refers to the highest external parent so that
every descendant resolves against the same physical external root.

### Nested-share hierarchy and external storage scope

Nested external shares have two independent ancestry concepts:

- `shares.parentId` always identifies the immediate parent. It defines the share hierarchy and drives permission delegation and propagation.
- `files.shareExternalId` identifies the highest external ancestor. For descendants, `SpaceEnv.root.externalParentShareId` carries that canonical
  storage scope to file operations.

For a hierarchy `A -> B -> C`, where `A` is the root external share:

| Share | Immediate `parentId` | Canonical `files.shareExternalId` |
|-------|----------------------|-----------------------------------|
| `A`   | `null`               | `A`                               |
| `B`   | `A`                  | `A`                               |
| `C`   | `B`                  | `A`                               |

Resolving the external storage scope must never rewrite `shares.parentId`. File metadata, lock conflict checks and cleanup, and event and quota
repository routing must all use the same canonical `files.shareExternalId`. A correct physical path is not sufficient to identify this logical scope.

If the highest external ancestor cannot be resolved, the operation must fail before modifying the filesystem. It must not fall back to the immediate
parent, the current descendant, or the authenticated actor.

## Child-share permission delegation

Creating a child share requires the effective `SHARE_OUTSIDE` permission on its immediate parent. Requested member and link permissions are
intersected with the creator's effective permissions on that parent, so a child cannot delegate rights that its creator does not hold.

Member and link permissions are stored on each share. Permission removals on a parent are propagated through the descendant branches created from that
delegation. New permissions on a parent do not automatically expand existing descendant grants. Removing a member from a parent can also remove child
shares owned through that delegation unless another effective membership still grants the required share permission.

## Deleting a share and deleting shared content

Deleting a share definition removes the share, its memberships, and its child share definitions. It does not delete the source content from the
filesystem.

Deleting a file or directory while browsing `shares/<share-alias>/...` is a separate file operation. It follows the storage provenance of the shared
content rather than the authenticated actor or the owner of the share record.

The `shares/<share-alias>` endpoint itself is virtual and cannot be deleted by a file operation; only its descendants can be deletion targets.
Selecting permanent deletion does not bypass the effective `DELETE` permission or lock conflict checks.

## Shared-content deletion policy

| Shared content                                 | Deletion target                       |
|------------------------------------------------|---------------------------------------|
| Personal files                                 | The source owner's managed user trash |
| Native-space files                             | The source space's managed trash      |
| External root attached to a native space       | The source space's managed trash      |
| External share                                 | Permanent deletion                    |
| Child or other descendant of an external share | Permanent deletion                    |

The permanent-deletion rule is selected when the resolved space is in the shares repository and its root has an `externalPath`, unless its provenance
points to a native space. It applies regardless of whether the actor is a regular user, guest, or link pseudo-user.

For an external share, deleting shared content:

1. removes the resource directly from the external filesystem;
2. permanently removes the corresponding file records from the database;
3. removes associated locks;
4. emits a `DELETE_PERMANENTLY` event.

The operation never uses the actor's home, a share-record owner's home, or an
`<external-root>/.trash/` directory. There is no fallback destination and no migration from an existing `.trash` directory.

Because no managed trash entry is created, deleted external-share content cannot be listed, restored, or removed later by the trash retention
scheduler. If the external location cannot be modified, the deletion fails instead of redirecting the resource to another storage owner.

## Future external trash support

The permanent-deletion rule is the current policy until external trash is implemented as a first-class repository. Such a repository must be
explicitly addressable by the file browser and must define empty, restore, and retention lifecycles before external-share deletion can target it.

The managed trash layout and lifecycle are specified in
[`spaces.md`](../spaces/spaces.md).
