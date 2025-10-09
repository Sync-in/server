
## [1.6.1](https://github.com/Sync-in/server/compare/v1.6.0...v1.6.1) (2025-10-09)


### Bug Fixes

* **backend:auth:** improve AD/LDAP authentication handling and normalization ([db1a9e3](https://github.com/Sync-in/server/commit/db1a9e3d4a02c6be5ef594b4a383e05d0bc50fc4))
* **frontend:links:** fallback to default MIME URL when origin MIME URL is not found ([5724f3a](https://github.com/Sync-in/server/commit/5724f3a730fc8d8b51268071b0d3370bc62f6901))

## [1.6.0](https://github.com/Sync-in/server/compare/v1.5.2...v1.6.0) (2025-09-26)

🔥🚀 Support for Multi-Factor Authentication (MFA) & App Passwords

### Features

* **feat: mfa and app passwords** ([5ed579f](https://github.com/Sync-in/server/commit/5ed579fd31dcf51770abe52f385b4ed306a22bd8) [431a988](https://github.com/Sync-in/server/commit/431a988c6d0b88711b50b642bd440c42f80283ce) [43a8b10](https://github.com/Sync-in/server/commit/43a8b10eb8869eafd3014cdad034c2b093237edf) [91eda5c](https://github.com/Sync-in/server/commit/91eda5cbc396da3bd6cfddf5e1e4001466327575))
* **backend:sync:** handle 2FA during client registration ([b0aadde](https://github.com/Sync-in/server/commit/b0aadde6323ffc9a61f43ea424b7cff8922f718d))
* **backend:auth:** add support for AD-specific LDAP attributes ([1b6a8fc](https://github.com/Sync-in/server/commit/1b6a8fc139db54a71a4aaa5cba7715d349ffef0f))
* **backend:infrastructure:** allow configuration of ignoreTLS and rejectUnauthorized for SMTP transport ([c1b3f5a](https://github.com/Sync-in/server/commit/c1b3f5a810e2cdc6977b48022f491e602b70ee9f))
* **backend:notifications:** add email notifications for two-factor authentication security events ([b207f33](https://github.com/Sync-in/server/commit/b207f336c2dc75deec7992975b7aa1376289ee42))
* **backend:notifications:** include link password in sent emails ([1a3ed0a](https://github.com/Sync-in/server/commit/1a3ed0a7624c16986ced259d8e272eaa2872c8a8))
* **backend:users:** add email notifications when account is locked ([954bb10](https://github.com/Sync-in/server/commit/954bb1061e6399768aad13d9822491975a843b9b))


### Bug Fixes

* **backend:auth:** improve handling of sql errors ([f4b78fa](https://github.com/Sync-in/server/commit/f4b78fa2779d2fea01d7dd554d861cb6272b594e))
* **backend:users:** ensure default value for user secrets when null ([090eb6e](https://github.com/Sync-in/server/commit/090eb6e61f4973522f201879e611b744aa0677e8))

## [1.5.2](https://github.com/Sync-in/server/compare/v1.5.1...v1.5.2) (2025-09-09)


### Bug Fixes

* crash on non-AVX CPUs with musl: @napi-rs/canvas >=0.1.7.8 triggers "Illegal Instruction" when AVX is not supported ([de2f983](https://github.com/Sync-in/server/commit/de2f98348395fa7e711c52c30d1e1d59579282d3))

## [1.5.1](https://github.com/Sync-in/server/compare/v1.5.0...v1.5.1) (2025-09-07)


### Bug Fixes

* **docker:** fix /app ownership for .init file ([e43f478](https://github.com/Sync-in/server/commit/e43f47873768fa24ba2e66bc1bbd90214bde5ca1))

## [1.5.0](https://github.com/Sync-in/server/compare/v1.4.0...v1.5.0) (2025-09-07)


### Features

* **files:** optimize document opening to avoid extra API calls ([bf57d93](https://github.com/Sync-in/server/commit/bf57d93dcaea312328db9f1f5290e46471d2f638))
* **frontend:files:** display count for multiple selected files and open sidebar pasteboard when adding files ([39feccd](https://github.com/Sync-in/server/commit/39feccd3d89f29cdc4effb2bb4c016c7c1258729))
* **frontend:spaces:** enable keyboard navigation when files are selected in list mode ([7e38ce2](https://github.com/Sync-in/server/commit/7e38ce29fbfe11b84ccd7824aea1e43ae46e0d0f))


### Bug Fixes

* **backend:links:** increment nbAccess even when no limit is set ([d6d2e74](https://github.com/Sync-in/server/commit/d6d2e7425c16510ee9e15107a02f21d2038be89f))
* **frontend:spaces:** prevent false positives when checking external location ([f1fdd0d](https://github.com/Sync-in/server/commit/f1fdd0d4088e98f4e24f4a4c18cf6f67e3e5d0d4))

### Performance
* **docker:** only change application data ownership ([6e88991](https://github.com/Sync-in/server/commit/6e889915fedf613030e43919e637d7888aea94a1))


## [1.4.0](https://github.com/Sync-in/server/compare/v1.3.9...v1.4.0) (2025-08-26)


### Features

* **backend:webdav:** add temporary hook for Joplin sync compatibility (laurent22/joplin[#12249](https://github.com/Sync-in/server/issues/12249)) ([fc22a7d](https://github.com/Sync-in/server/commit/fc22a7d828f99abe65423d03418fe397ab45d7b0))
* **backend:files:** add showHiddenFiles option to toggle visibility of dotfiles ([ed47fbf](https://github.com/Sync-in/server/commit/ed47fbf3fe7fe5b66868489c319d3c438fde0dbf))
* **backend:files:** allow markdown files to be edited with onlyOffice ([c3d9d85](https://github.com/Sync-in/server/commit/c3d9d85d3f1dc90f4afae8db8ce9d128c8ecadf2))
* **frontend:spaces:** open documents in edit mode on double-click ([d6ef175](https://github.com/Sync-in/server/commit/d6ef175d951b4e11ce78d280e4982e3ed8a4bb3f))


### Bug Fixes

* **backend:users:** ensure permission guards correctly evaluate array permissions ([c27dc7b](https://github.com/Sync-in/server/commit/c27dc7b7ac20293febca17d18ae8608d61eb1b44))

## [1.3.9](https://github.com/Sync-in/server/compare/v1.3.8...v1.3.9) (2025-08-22)


### Features

* **backend:** allow IPv6 in database fields for IP addresses ([757f2d1](https://github.com/Sync-in/server/commit/757f2d117865fa41c2cdf759b9f54477434dee79))


### Bug Fixes

* **backend:config:** do not lowercase env var values ([cb73ab0](https://github.com/Sync-in/server/commit/cb73ab0287346b58ae8f34ed985d891a9a5a6732))
* **docker:nginx:** optionalize OnlyOffice proxying and avoid startup failure when container is absent ([2be107f](https://github.com/Sync-in/server/commit/2be107feda42ca8bb1edd1a9b99e3e62ff9dc234))

## [1.3.8](https://github.com/Sync-in/server/compare/v1.3.7...v1.3.8) (2025-08-19)


### Bug Fixes

* **frontend:assets:** replace symlinked SVGs with real files to fix Angular 20 build issues ([3749e44](https://github.com/Sync-in/server/commit/3749e4419ad4bce037297bd9872c0b585af6c73f))


### Chores

* **CHANGELOG.md:** cleanup ([a44c6ce](https://github.com/Sync-in/server/commit/a44c6ce11b6d65758452788b5733c017af48a516))
* **husky:** limit pre-commit hook to lint only ([20fa56d](https://github.com/Sync-in/server/commit/20fa56d36f024d5a1a5559569e3dd67749c02277))
* **README.md:** add keywords ([81c1a6e](https://github.com/Sync-in/server/commit/81c1a6e1dc23d9e4416ef6face0830b5278154d9))

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
