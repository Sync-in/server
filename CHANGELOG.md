## [1.2.0](https://github.com/Sync-in/server/compare/v1.1.1...v1.2.0) (2025-07-28)

### Features

* allow SYNCIN_ env vars to override default config ([5907f81](https://github.com/Sync-in/server/commit/5907f81e4001d3c86d49465bad7642ac9516ea76))
* **config:** allow SYNCIN_ env vars to override default
  config ([c1fcd61](https://github.com/Sync-in/server/commit/c1fcd6141e4a551dd108cf81e9a0c64b8f20391d))
* **docker:** add PUID/PGID env variables ([c674b73](https://github.com/Sync-in/server/commit/c674b73b282c1eee4bc5e7fb03ecdb3a8e2ec1ff))

### Bug Fixes

* **backend:sendfile:** properly encode file paths with special characters and await call to catch
  errors ([2bf2284](https://github.com/Sync-in/server/commit/2bf2284bb273ac8b06136803717020c4a8ede5a7))
* **frontend:files:** detect .mp4 video files properly ([4df92a5](https://github.com/Sync-in/server/commit/4df92a531d6bae049a2ebd6beb036b36d21258ca))
* **frontend:files:** keep aspect ratio for images with large
  width ([#4](https://github.com/Sync-in/server/issues/4)) ([8ac398a](https://github.com/Sync-in/server/commit/8ac398a795b05fb4565efd12feedc5b0f9e384c7))
* **frontend:layout:** increase context menu trigger timeout to ensure full
  rendering ([3c19bce](https://github.com/Sync-in/server/commit/3c19bceeb5cc3f86e3db68b0ae554a686820ca8b))
* **frontend:shares:** duplicate children in
  recurseChildrenShares ([09d7b6d](https://github.com/Sync-in/server/commit/09d7b6d37d006390144b558eaf1a0857e648ec6e))
* **frontend:styles:** fix right sidebar menu height ([4c871d8](https://github.com/Sync-in/server/commit/4c871d88586932c27ab1da40aa4ee513b9f36252))

### Security Fixes

* **backend:security:** prevent path traversal & SSRF ([d79d28c](https://github.com/Sync-in/server/commit/d79d28c2d6ccf21b2b81bfd0779978e1a5f3c475))

### Community Highlights ❤️

A big thank you to **Alex Zalo** ( @zalo-alex ) for his security audit.  
Thanks to his expertise, several vulnerabilities were identified and patched in this release.  
His contribution is truly valuable to us, and we’re grateful to have him as part of the Sync-in community 🎉

Good news never comes alone!  
We’re thrilled to welcome **Tibs** (@7185) to the Sync-in organization 🌟 !  
A big thank-you to him for stepping in and supporting the community.

## [1.1.1](https://github.com/Sync-in/server/compare/v1.1.0...v1.1.1) (2025-07-20)

### Bug Fixes

* **backend:users:** prevent members of isolated groups from seeing their group and its
  members ([bbf4082](https://github.com/Sync-in/server/commit/bbf4082ef44aed0ed27d0438da97b0fa26895719))
* **Dockerfile:** use port 8080 ([8167ad8](https://github.com/Sync-in/server/commit/8167ad8cce1f0052f8ef02b0b099fb6e6d36524e))
* **frontend:app:** display the correct version of the
  package ([2d0a83e](https://github.com/Sync-in/server/commit/2d0a83eb20fe836047bc12666bffff06238788dc))
* **frontend:users:** properly update websocket connection on admin impersonation and
  return ([5cf1e75](https://github.com/Sync-in/server/commit/5cf1e751a2592978567a8d729828d562152aa6e2))

## [1.1.0](https://github.com/Sync-in/server/compare/58a0124d40d59fc611656efb77af9ca4d5dcf52c...v1.1.0) (2025-07-19)

### Features

* **backend:** add option to enable log colorization ([1d3e552](https://github.com/Sync-in/server/commit/1d3e5525387d501797db80e03aae5c4a3bb388ef))
* **backend:** add shebang to allow CLI execution ([cfca2b1](https://github.com/Sync-in/server/commit/cfca2b1e7449ac1dbdef879cacdaa24ed30d48d2))
* **frontend:sync:** add createDirectory flag when electron dialog is
  open ([58a0124](https://github.com/Sync-in/server/commit/58a0124d40d59fc611656efb77af9ca4d5dcf52c))

### Bug Fixes

* **frontend:recents:** handle MIME image load error with fallback
  function ([27266e5](https://github.com/Sync-in/server/commit/27266e59c24d3a1b7b4453c81f84ee818f537b72))
