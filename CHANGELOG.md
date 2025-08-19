
## [1.3.7](https://github.com/Sync-in/server/compare/v1.3.2...v1.3.7) (2025-08-19)


### Bug Fixes

* **backend:files:** correct archive name when downloading a folder ([1474949](https://github.com/Sync-in/server/commit/147494906e7a04f520195dfb747eb791daabfbc3))
* **backend:sync:** avoid "parent must exist" error when files are moved before destination folder creation during sync ([8c92535](https://github.com/Sync-in/server/commit/8c9253551aa1d90c7fe340b81e5f9b48c82b6fdf))


### Chores

* **docker:** allow http2 in nginx directives ([4ad2ffb](https://github.com/Sync-in/server/commit/4ad2ffbfe12720af75aeac1d7ee7e383d73ad981))
* **frontend:** add missing video-mp4 mime type ([d210268](https://github.com/Sync-in/server/commit/d210268bc8cb5a5e61e0bbc24f431915b509b32d))
* **frontend:** bump to angular 20 ([363671a](https://github.com/Sync-in/server/commit/363671ac5e6ad6299477bf07f0bcffe1cff3e3f4))
* **npm-sync-in-server.js:** more verbose createUser function ([1ea155a](https://github.com/Sync-in/server/commit/1ea155a23f092312cb234758c59002bbe01458b2))
* **frontend:** update-angular-19-to-20 ([14f0397](https://github.com/Sync-in/server/commit/14f03973a77370f531bd1ed4c6c2052b76c15ea2))
* **ci:** add Husky pre-commit hook for lint and test ([281e32d](https://github.com/Sync-in/server/commit/281e32df28e092b6ea0a57d94b6f8279ca67c4c1))
* **ci:** remove husky prepare ([8e911ab](https://github.com/Sync-in/server/commit/8e911abf11e5a3265ea6afe30e26879452766a20))

## [1.3.2](https://github.com/Sync-in/server/compare/v1.3.1...v1.3.2) (2025-08-08)

### Features

* **cli** add create-user command to manage user creation


## [1.3.1](https://github.com/Sync-in/server/compare/v1.3.0...v1.3.1) (2025-08-08)


### Bug Fixes

* **backend:conf:** handle undefined logger.stdout in some environments ([08087ba](https://github.com/Sync-in/server/commit/08087bab675860d4c35041f9cd1752840df3cc7f))
* **backend:test:** log path ([eabf3d7](https://github.com/Sync-in/server/commit/eabf3d734721fbfd821489ac2bc83913c9afaf2e))
* **backend:validation:** log file path ([0e8c695](https://github.com/Sync-in/server/commit/0e8c695437dae0e6000e213382e1f4c7d91aef93))

## [1.3.0](https://github.com/Sync-in/server/compare/v1.2.2...v1.3.0) (2025-08-08)


### Features

* add support for npm distribution and server management CLI ([4a5f821](https://github.com/Sync-in/server/commit/4a5f8215d1caf6d7a3296f223a8ec90a20fe46e0))
* **backend:** make log file path configurable via logger.filePath ([5ffac5a](https://github.com/Sync-in/server/commit/5ffac5a9f42e707da0c9f5d6fba73d6d6022b8fb))

## [1.2.2](https://github.com/Sync-in/server/compare/v1.2.1...v1.2.2) (2025-08-04)

### Features

* **onlyoffice** updated compatibility with version 9.x (added md, vsdx, odg... to viewable extensions)
* **docker** include Docker Compose files to track them across releases

### Bug Fixes

* **test:** assign proper token names for csrf and ws ([bfe43e5](https://github.com/Sync-in/server/commit/bfe43e5f099cf4a4b07943a55e9242843d8b74c2))

## [1.2.1](https://github.com/Sync-in/server/compare/v1.2.0...v1.2.1) (2025-08-02)


### Bug Fixes

* **backend:files:** await lock creation to prevent premature destruction ([05f1a98](https://github.com/Sync-in/server/commit/05f1a98077eceb33fdc3b8312fc0884870c40a38))
* **backend:files:** remove duplicate extension on compressed archives introduced by path-traversal security patch ([9deeafc](https://github.com/Sync-in/server/commit/9deeafcd2cacd6371e0e423416425511ae3e9ff7))
* **backend:files:** restore folder upload regression after path-traversal patch ([3204fd0](https://github.com/Sync-in/server/commit/3204fd0524b87edd0a7450bb3d27315e5a390452))
* **backend:users:** support client WebSocket IP from x-forwarded-for when trustProxy is enabled ([3e66c40](https://github.com/Sync-in/server/commit/3e66c40b6d0884b66b8f45c183ea0253903e4c16))
* **docker:** use INIT_ADMIN env var to control admin account creation ([c6bb358](https://github.com/Sync-in/server/commit/c6bb3589e832bf46a492814bc05e2d8de2699435))
* **frontend:files:** correct folder drag-and-drop for browsers without webkitRelativePath ([e0115ec](https://github.com/Sync-in/server/commit/e0115ec38805c1dfcd39ab7522c81549ec05bdd4))

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
