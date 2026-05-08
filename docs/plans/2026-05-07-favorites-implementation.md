# Favorites Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-user file favorites to the backend and classic Angular UI, suitable for upstreaming to Sync-in/server.

**Architecture:** New `files_favorites(userId, fileId, createdAt)` join table; backend service + 3 controller endpoints; Angular favorites module (sidebar entry + list widget) mirroring the existing recents pattern; star toggle on every file row via an optional `isFavorite` field in `browseFiles`.

**Tech Stack:** NestJS + Drizzle ORM (MySQL) backend; Angular 17+ with signals frontend; monorepo (backend types imported directly by frontend).

**Worktree:** `/Users/janwiebe/prive/sync-in-server/.worktrees/upstream-contrib-favorites`
**Run all commands from the worktree root unless noted.**

---

## Task 1: Database schema

**Files:**
- Create: `backend/src/applications/files/schemas/files-favorites.schema.ts`
- Modify: `backend/src/infrastructure/database/schema.ts`

**Step 1: Create the schema file**

```ts
// backend/src/applications/files/schemas/files-favorites.schema.ts
import { Column, SQL, sql } from 'drizzle-orm'
import { bigint, datetime, index, mysqlTable, primaryKey } from 'drizzle-orm/mysql-core'
import { files } from './files.schema'
import { users } from '../../users/schemas/users.schema'

export const filesFavorites = mysqlTable(
  'files_favorites',
  {
    userId: bigint('userId', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fileId: bigint('fileId', { mode: 'number', unsigned: true })
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.fileId] }),
    index('user_idx').on(table.userId),
  ]
)

export const fileIsFavoriteForUserSQL = (fileId: Column | SQL, userId: Column | SQL): SQL =>
  sql`EXISTS(SELECT 1 FROM ${filesFavorites} WHERE ${sql`${filesFavorites.fileId}`} = ${sql`${fileId}`} AND ${sql`${filesFavorites.userId}`} = ${sql`${userId}`})`
```

**Step 2: Export from schema barrel**

In `backend/src/infrastructure/database/schema.ts`, add:
```ts
export * from '../../applications/files/schemas/files-favorites.schema'
```
alongside the existing files exports.

**Step 3: Generate the migration**

```bash
npm run -w backend db:generate
```

Expected: creates a new file in `backend/src/infrastructure/database/migrations/` and updates `meta/_journal.json`.

**Step 4: Commit**

```bash
git add backend/src/applications/files/schemas/files-favorites.schema.ts \
        backend/src/infrastructure/database/schema.ts \
        backend/src/infrastructure/database/migrations/
git commit -m "feat(files): add files_favorites schema and migration"
```

---

## Task 2: Extend FileProps with isFavorite

**Files:**
- Modify: `backend/src/applications/files/interfaces/file-props.interface.ts`

**Step 1: Add optional field**

Add `isFavorite?: boolean` to the `FileProps` interface, alongside `hasComments?`:

```ts
hasComments?: boolean
isFavorite?: boolean
```

**Step 2: Commit**

```bash
git add backend/src/applications/files/interfaces/file-props.interface.ts
git commit -m "feat(files): add isFavorite to FileProps"
```

---

## Task 3: Query layer — browseFiles + CRUD

**Files:**
- Modify: `backend/src/applications/files/services/files-queries.service.ts`

**Step 1: Add import**

At the top of `files-queries.service.ts`, import the new schema and helper:

```ts
import { fileIsFavoriteForUserSQL, filesFavorites } from '../schemas/files-favorites.schema'
```

Also add `sql` to the drizzle-orm import if not already there (it is — check line 2).

**Step 2: Extend `browseFiles` options**

In the `browseFiles` options type, add `withIsFavorite?: boolean`.

In the select object, alongside the `withHasComments` entry:
```ts
...(options.withIsFavorite && {
  isFavorite: fileIsFavoriteForUserSQL(files.id, sql.raw(userId.toString())).mapWith(Boolean)
})
```

Note: `userId` is already the first parameter of `browseFiles` — use it directly. Check how `fileHasCommentsSubquerySQL` is used for the exact pattern (line ~65).

**Step 3: Add getFavorites**

```ts
async getFavorites(userId: number, limit = 100): Promise<FileProps[]> {
  return this.db
    .select({
      id: files.id,
      path: files.path,
      name: files.name,
      isDir: files.isDir,
      mime: files.mime,
      size: files.size,
      mtime: files.mtime,
      ctime: files.ctime,
      ownerId: files.ownerId,
      spaceId: files.spaceId,
      spaceExternalRootId: files.spaceExternalRootId,
      shareExternalId: files.shareExternalId,
      inTrash: files.inTrash,
      isFavorite: sql<boolean>`true`.mapWith(Boolean),
    })
    .from(filesFavorites)
    .innerJoin(files, eq(files.id, filesFavorites.fileId))
    .where(eq(filesFavorites.userId, userId))
    .orderBy(desc(filesFavorites.createdAt))
    .limit(limit)
}
```

Import `desc` from `drizzle-orm` if not already imported.

**Step 4: Add addFavorite**

```ts
async addFavorite(userId: number, fileId: number): Promise<void> {
  await this.db
    .insert(filesFavorites)
    .values({ userId, fileId, createdAt: new Date() })
    .onDuplicateKeyIgnore()
}
```

**Step 5: Add removeFavorite**

```ts
async removeFavorite(userId: number, fileId: number): Promise<void> {
  await this.db
    .delete(filesFavorites)
    .where(and(eq(filesFavorites.userId, userId), eq(filesFavorites.fileId, fileId)))
}
```

**Step 6: Commit**

```bash
git add backend/src/applications/files/services/files-queries.service.ts
git commit -m "feat(files): extend FilesQueries with favorites CRUD and isFavorite in browseFiles"
```

---

## Task 4: FilesFavorites service (TDD)

**Files:**
- Create: `backend/src/applications/files/services/files-favorites.service.spec.ts`
- Create: `backend/src/applications/files/services/files-favorites.service.ts`

**Step 1: Write the failing spec first**

```ts
// files-favorites.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UserModel } from '../../users/models/user.model'
import { FilesQueries } from './files-queries.service'
import { FilesFavorites } from './files-favorites.service'

describe(FilesFavorites.name, () => {
  let service: FilesFavorites
  let filesQueries: {
    getFavorites: jest.Mock
    addFavorite: jest.Mock
    removeFavorite: jest.Mock
  }

  const user = { id: 1 } as UserModel

  beforeEach(async () => {
    filesQueries = {
      getFavorites: jest.fn().mockResolvedValue([]),
      addFavorite: jest.fn().mockResolvedValue(undefined),
      removeFavorite: jest.fn().mockResolvedValue(undefined),
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesFavorites,
        { provide: FilesQueries, useValue: filesQueries },
      ],
    }).compile()
    module.useLogger(['fatal'])
    service = module.get<FilesFavorites>(FilesFavorites)
  })

  afterEach(() => jest.clearAllMocks())

  it('should be defined', () => expect(service).toBeDefined())

  it('getFavorites delegates to filesQueries', async () => {
    const files = [{ id: 1, name: 'a.txt' }]
    filesQueries.getFavorites.mockResolvedValue(files)
    const result = await service.getFavorites(user)
    expect(result).toBe(files)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, undefined)
  })

  it('getFavorites passes limit when provided', async () => {
    await service.getFavorites(user, 5)
    expect(filesQueries.getFavorites).toHaveBeenCalledWith(user.id, 5)
  })

  it('addFavorite delegates to filesQueries', async () => {
    await service.addFavorite(user, 42)
    expect(filesQueries.addFavorite).toHaveBeenCalledWith(user.id, 42)
  })

  it('removeFavorite delegates to filesQueries', async () => {
    await service.removeFavorite(user, 42)
    expect(filesQueries.removeFavorite).toHaveBeenCalledWith(user.id, 42)
  })
})
```

**Step 2: Run spec — expect it to fail (service not yet created)**

```bash
cd backend && npx jest files-favorites.service.spec --verbose 2>&1 | tail -20
cd ..
```

**Step 3: Implement the service**

```ts
// files-favorites.service.ts
import { Injectable } from '@nestjs/common'
import type { FileProps } from '../interfaces/file-props.interface'
import { UserModel } from '../../users/models/user.model'
import { FilesQueries } from './files-queries.service'

@Injectable()
export class FilesFavorites {
  constructor(private readonly filesQueries: FilesQueries) {}

  getFavorites(user: UserModel, limit?: number): Promise<FileProps[]> {
    return this.filesQueries.getFavorites(user.id, limit)
  }

  addFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.addFavorite(user.id, fileId)
  }

  removeFavorite(user: UserModel, fileId: number): Promise<void> {
    return this.filesQueries.removeFavorite(user.id, fileId)
  }
}
```

**Step 4: Run spec — expect all tests to pass**

```bash
cd backend && npx jest files-favorites.service.spec --verbose 2>&1 | tail -20
cd ..
```

**Step 5: Register in FilesModule**

In `backend/src/applications/files/files.module.ts`:
- Import `FilesFavorites`
- Add to `providers` array (alongside `FilesRecents`)
- Add to `exports` array

**Step 6: Commit**

```bash
git add backend/src/applications/files/services/files-favorites.service.ts \
        backend/src/applications/files/services/files-favorites.service.spec.ts \
        backend/src/applications/files/files.module.ts
git commit -m "feat(files): FilesFavorites service with tests"
```

---

## Task 5: Route constants + controller endpoints

**Files:**
- Modify: `backend/src/applications/files/constants/routes.ts`
- Modify: `backend/src/applications/files/files.controller.ts`

**Step 1: Add route constants**

In `routes.ts`, add to `FILES_ROUTE`:
```ts
FAVORITES: 'favorites',
FAVORITE: 'favorite',
```

Add exported constants:
```ts
export const API_FILES_FAVORITES = `${FILES_ROUTE.BASE}/${FILES_ROUTE.FAVORITES}`
export const API_FILES_FAVORITE = `${FILES_ROUTE.BASE}/${FILES_ROUTE.FAVORITE}`
```

**Step 2: Add controller endpoints**

In `files.controller.ts`:
- Import `FilesFavorites` from `./services/files-favorites.service`
- Import `ParseIntPipe` from `@nestjs/common` (check if already imported)
- Inject `private readonly filesFavorites: FilesFavorites` in the constructor

Add three endpoints below the `// RECENT FILES` block:

```ts
// FAVORITES

@Get(FILES_ROUTE.FAVORITES)
@SkipSpaceGuard()
getFavorites(@GetUser() user: UserModel, @Query('limit') limit?: number): Promise<FileProps[]> {
  return this.filesFavorites.getFavorites(user, limit ? +limit : undefined)
}

@Post(`${FILES_ROUTE.FAVORITE}/:fileId`)
@SkipSpaceGuard()
addFavorite(@GetUser() user: UserModel, @Param('fileId', ParseIntPipe) fileId: number): Promise<void> {
  return this.filesFavorites.addFavorite(user, fileId)
}

@Delete(`${FILES_ROUTE.FAVORITE}/:fileId`)
@SkipSpaceGuard()
removeFavorite(@GetUser() user: UserModel, @Param('fileId', ParseIntPipe) fileId: number): Promise<void> {
  return this.filesFavorites.removeFavorite(user, fileId)
}
```

**Step 3: Verify build**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
cd ..
```

Fix any type errors before committing.

**Step 4: Commit**

```bash
git add backend/src/applications/files/constants/routes.ts \
        backend/src/applications/files/files.controller.ts
git commit -m "feat(files): favorites controller endpoints GET/POST/DELETE"
```

---

## Task 6: Frontend — constants, routes, app.routes

**Files:**
- Create: `frontend/src/app/applications/favorites/favorites.constants.ts`
- Create: `frontend/src/app/applications/favorites/favorites.routes.ts`
- Modify: `frontend/src/app/app.routes.ts`

**Step 1: Create constants**

```ts
// favorites.constants.ts
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faStar } from '@fortawesome/free-solid-svg-icons'

export const FAVORITES_PATH = {
  BASE: 'favorites'
} as const

export const FAVORITES_TITLE = 'Favorites'

export const FAVORITES_ICON: IconDefinition = faStar
```

**Step 2: Create routes**

```ts
// favorites.routes.ts
import { Routes } from '@angular/router'
import { APP_PATH } from '../../app.constants'
import { FavoritesComponent } from './components/favorites.component'
import { FAVORITES_PATH } from './favorites.constants'

export const favoritesRoutes: Routes = [
  { path: APP_PATH.BASE, pathMatch: 'full', redirectTo: FAVORITES_PATH.BASE },
  { path: FAVORITES_PATH.BASE, component: FavoritesComponent }
]
```

**Step 3: Register in app.routes.ts**

Import `favoritesRoutes` and add it to the routes array alongside `recentsRoutes`. Look at how `recentsRoutes` is imported and added — mirror it exactly.

**Step 4: Commit**

```bash
git add frontend/src/app/applications/favorites/ \
        frontend/src/app/app.routes.ts
git commit -m "feat(favorites): add favorites route and constants"
```

---

## Task 7: Frontend — favorites components

**Files:**
- Create: `frontend/src/app/applications/favorites/components/favorites.component.ts`
- Create: `frontend/src/app/applications/favorites/components/favorites.component.html`
- Create: `frontend/src/app/applications/favorites/components/widgets/files-favorites-widget.component.ts`
- Create: `frontend/src/app/applications/favorites/components/widgets/files-favorites-widget.component.html`
- Create: `frontend/src/app/applications/favorites/components/widgets/files-favorites-widget.component.scss`

**Step 1: Create FavoritesComponent**

Mirror `RecentsComponent` (`frontend/src/app/applications/recents/components/recents.component.ts`):

```ts
// favorites.component.ts
import { Component, inject } from '@angular/core'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { LayoutService } from '../../../layout/layout.service'
import { FilesFavoritesWidgetComponent } from './widgets/files-favorites-widget.component'
import { FAVORITES_ICON, FAVORITES_PATH, FAVORITES_TITLE } from '../favorites.constants'

@Component({
  selector: 'app-favorites',
  imports: [AutoResizeDirective, FilesFavoritesWidgetComponent],
  templateUrl: './favorites.component.html'
})
export class FavoritesComponent {
  private readonly layout = inject(LayoutService)

  constructor() {
    this.layout.setBreadcrumbIcon(FAVORITES_ICON)
    this.layout.setBreadcrumbNav({ url: `/${FAVORITES_PATH.BASE}/${FAVORITES_TITLE}`, translating: true, sameLink: true })
  }
}
```

```html
<!-- favorites.component.html -->
<div appAutoResize class="recents-dashboard" [useMaxHeight]="false" [resizeOffset]="40">
  <div class="row recents-grid g-3">
    <div class="col-md-6">
      <app-files-favorites-widget></app-files-favorites-widget>
    </div>
  </div>
</div>
```

**Step 2: Create FilesFavoritesWidgetComponent**

Mirror `FilesRecentsWidgetComponent`. Key differences:
- Uses `store.filesFavorites()` signal (added in Task 8)
- Calls `filesService.loadFavorites(limit)` (added in Task 8)
- Navigation: for personal files (`file.ownerId`), navigate to `SPACES_PATH.PERSONAL_FILES`; for space files (`file.spaceId`), navigate to `SPACES_PATH.SPACES_FILES` — both with `queryParams: { select: file.name }`
- Empty state: "No favorites"

```ts
// files-favorites-widget.component.ts
import { Component, computed, inject, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFileLines, faStar } from '@fortawesome/free-solid-svg-icons'
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import type { FileProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import { FilesService } from '../../../files/services/files.service'

@Component({
  selector: 'app-files-favorites-widget',
  imports: [L10nTranslateDirective, FaIconComponent, TimeAgoPipe],
  templateUrl: './files-favorites-widget.component.html',
  styleUrl: './files-favorites-widget.component.scss'
})
export class FilesFavoritesWidgetComponent {
  protected moreElements = false
  protected readonly icons = { faFileLines, faStar, faMagnifyingGlassPlus, faMagnifyingGlassMinus }
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private nbInitialFiles = 10
  private nbFiles = this.nbInitialFiles
  protected files: Signal<FileProps[]> = computed(() => this.store.filesFavorites().slice(0, this.nbFiles))

  constructor() {
    this.load()
  }

  switchMore() {
    this.moreElements = !this.moreElements
    this.nbFiles = this.moreElements ? this.nbInitialFiles * 5 : this.nbInitialFiles
    this.load()
  }

  goToFile(f: FileProps) {
    const basePath = f.spaceId ? SPACES_PATH.SPACES_FILES : SPACES_PATH.PERSONAL_FILES
    this.router.navigate([basePath], { queryParams: { select: f.name } }).catch(console.error)
  }

  private load() {
    this.filesService.loadFavorites(this.nbFiles)
  }
}
```

```html
<!-- files-favorites-widget.component.html — mirror recents-widget template -->
<!-- Replace "Files" title with faStar icon, "No recent files" with "No favorites" -->
<!-- Use f.mtime for the time display -->
<!-- For mime icon: use getAssetsMimeUrl(f.mime) — look at FileRecentModel for the pattern -->
```

For the HTML template, copy `files-recents-widget.component.html` and adapt:
- Change title text from "Files" to use `faStar` icon + "Favorites" label
- Change `@empty` text to "No favorites"
- The `(click)="goToFile(f)"` and `f.name`, `f.mtime` work the same way
- For mime icon: bind `[src]` to `getAssetsMimeUrl(f.mime)` inline (import the helper or compute in component)

```scss
/* files-favorites-widget.component.scss — can be empty; relies on .recents-widget-card shared styles */
```

**Step 3: Commit**

```bash
git add frontend/src/app/applications/favorites/components/
git commit -m "feat(favorites): add favorites page and files-favorites widget"
```

---

## Task 8: Store signal + FilesService methods

**Files:**
- Modify: `frontend/src/app/store/store.service.ts`
- Modify: `frontend/src/app/applications/files/services/files.service.ts`

**Step 1: Add filesFavorites signal to StoreService**

Find where `filesRecents` is declared (line ~44). Add directly below it:

```ts
filesFavorites: WritableSignal<FileProps[]> = signal<FileProps[]>([])
```

Import `FileProps` from the backend if not already imported:
```ts
import type { FileProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
```

Also reset in the logout/reset path (find where `filesRecents.set([])` is called and add `this.filesFavorites.set([])` alongside it).

**Step 2: Add API constants to backend routes (already done in Task 5)**

The frontend imports `API_FILES_FAVORITES` and `API_FILES_FAVORITE` from:
```ts
import { API_FILES_FAVORITES, API_FILES_FAVORITE } from '@sync-in-server/backend/src/applications/files/constants/routes'
```

**Step 3: Add loadFavorites and toggleFavorite to FilesService**

Find where `loadRecents` is implemented (around line 203). Add below it:

```ts
loadFavorites(limit: number) {
  this.http
    .get<FileProps[]>(API_FILES_FAVORITES, { params: new HttpParams().set('limit', limit) })
    .subscribe({
      next: (fs: FileProps[]) => {
        this.store.filesFavorites.update((files) => [...fs, ...files.slice(limit)])
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Files', 'Unable to load favorites', e)
    })
}

toggleFavorite(fileId: number, add: boolean) {
  const req = add
    ? this.http.post<void>(`${API_FILES_FAVORITE}/${fileId}`, null)
    : this.http.delete<void>(`${API_FILES_FAVORITE}/${fileId}`)
  req.subscribe({
    next: () => {
      if (add) {
        // reload favorites to pick up newly starred file
        this.loadFavorites(100)
      } else {
        this.store.filesFavorites.update((files) => files.filter((f) => f.id !== fileId))
      }
    },
    error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Files', 'Unable to update favorite', e)
  })
}
```

Import `API_FILES_FAVORITES` and `API_FILES_FAVORITE` at the top of the file.

**Step 4: Commit**

```bash
git add frontend/src/app/store/store.service.ts \
        frontend/src/app/applications/files/services/files.service.ts
git commit -m "feat(favorites): store signal and FilesService loadFavorites/toggleFavorite"
```

---

## Task 9: Sidebar menu entry

**Files:**
- Modify: `frontend/src/app/applications/spaces/spaces.constants.ts`

**Step 1: Import favorites constants**

At the top of `spaces.constants.ts`, add:
```ts
import { FAVORITES_ICON, FAVORITES_PATH, FAVORITES_TITLE } from '../favorites/favorites.constants'
```

**Step 2: Add entry to SPACES_MENU.submenus**

After the Recents entry (line ~91–94), add:
```ts
{
  title: FAVORITES_TITLE,
  icon: FAVORITES_ICON,
  link: FAVORITES_PATH.BASE
},
```

**Step 3: Commit**

```bash
git add frontend/src/app/applications/spaces/spaces.constants.ts
git commit -m "feat(favorites): add Favorites to sidebar menu"
```

---

## Task 10: Star toggle on file rows

**Files:**
- Modify: `frontend/src/app/applications/files/models/file.model.ts`
- Modify: `frontend/src/app/applications/spaces/components/spaces-browser.component.ts`
- Modify: `frontend/src/app/applications/spaces/components/spaces-browser.component.html`

**Step 1: Add isFavorite to FileModel**

In `file.model.ts`, in the States section (around line 76), add:
```ts
isFavorite = false
```

`Object.assign(this, props)` in the constructor will populate it from the backend response automatically when `withIsFavorite` is active.

**Step 2: Add faStar icon + toggleFavorite handler to spaces-browser.component.ts**

Find the icons object (line ~143 area, where `faCommentDots` is listed). Add:
```ts
faStar,
faStarRegular,  // the outline version
```

Import:
```ts
import { faStar } from '@fortawesome/free-solid-svg-icons'
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons'
```

Inject `FilesService` if not already injected. Add method:
```ts
toggleFavorite(file: FileModel, event: MouseEvent) {
  event.stopPropagation()
  this.filesService.toggleFavorite(file.id, !file.isFavorite)
  file.isFavorite = !file.isFavorite  // optimistic update
}
```

**Step 3: Add star button to file row in template**

In `spaces-browser.component.html`, find the badge section where `f.hasComments` is checked (around line 425). Add a star button in that area:

```html
<span (click)="toggleFavorite(f, $event)"
      class="badge cursor-pointer me-1"
      [class.bg-warning]="f.isFavorite"
      [class.bg-secondary]="!f.isFavorite">
  <fa-icon [icon]="f.isFavorite ? icons.faStar : icons.faStarRegular"></fa-icon>
</span>
```

Place it before the comments badge so it's leftmost.

**Step 4: Enable withIsFavorite in the browseFiles call**

Find where `browseFiles` is called in the backend (likely in `files-methods.service.ts` or `files-manager.service.ts`) and add `withIsFavorite: true` to the options. Search for `withHasComments` to find the call site.

**Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
cd ..
```

Fix any errors.

**Step 6: Commit**

```bash
git add frontend/src/app/applications/files/models/file.model.ts \
        frontend/src/app/applications/spaces/components/spaces-browser.component.ts \
        frontend/src/app/applications/spaces/components/spaces-browser.component.html
git commit -m "feat(files): star toggle on file rows with isFavorite state"
```

---

## Final verification

**Run the backend test suite:**
```bash
cd backend && npx jest --verbose 2>&1 | tail -20
cd ..
```

Expect: all previously passing tests still pass, plus new `files-favorites.service.spec` passing.

**Check git log:**
```bash
git log upstream/main..HEAD --oneline
```

Expected: 10 commits, all conventional (`feat(files):`, `feat(favorites):`), no `mod()/custom()` prefixes.

**Verify no custom-* imports:**
```bash
grep -r "custom-" backend/src/applications/files/ frontend/src/app/applications/favorites/
```

Expected: no matches.
