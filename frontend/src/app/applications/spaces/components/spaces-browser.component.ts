import { KeyValuePipe, NgTemplateOutlet } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { AfterViewInit, Component, ElementRef, HostListener, inject, NgZone, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core'
import { ActivatedRoute, Data, Router, UrlSegment } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faAnchor,
  faArrowDown,
  faArrowRotateRight,
  faArrowsAlt,
  faArrowUp,
  faBan,
  faCircleInfo,
  faClipboardList,
  faCommentDots,
  faDownload,
  faEllipsis,
  faEye,
  faFileAlt,
  faFileArchive,
  faFolderOpen,
  faGlobe,
  faLink,
  faLock,
  faLockOpen,
  faPen,
  faPlus,
  faRotate,
  faSpellCheck,
  faUpload
} from '@fortawesome/free-solid-svg-icons'
import { ContextMenuComponent, ContextMenuModule } from '@perfectmemory/ngx-contextmenu'
import { tarExtension } from '@sync-in-server/backend/src/applications/files/constants/compress'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { CompressFileDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import type { FileProps } from '@sync-in-server/backend/src/applications/files/interfaces/file-props.interface'
import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import { type FileTask, FileTaskStatus } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { SHARE_TYPE } from '@sync-in-server/backend/src/applications/shares/constants/shares'
import { SPACE_OPERATION, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceFiles } from '@sync-in-server/backend/src/applications/spaces/interfaces/space-files.interface'
import { intersectPermissions } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { take } from 'rxjs/operators'
import { FilterComponent } from '../../../common/components/filter.component'
import { NavigationViewComponent, ViewMode } from '../../../common/components/navigation-view/navigation-view.component'
import { VirtualScrollComponent } from '../../../common/components/virtual-scroll.component'
import { InputEditDirective } from '../../../common/directives/input-edit.directive'
import { TapDirective } from '../../../common/directives/tap.directive'
import { UploadFilesDirective } from '../../../common/directives/upload-files.directive'
import { TableHeaderConfig } from '../../../common/interfaces/table.interface'
import { SearchFilterPipe } from '../../../common/pipes/search.pipe'
import { ToBytesPipe } from '../../../common/pipes/to-bytes.pipe'
import { decrement, elementIsVisible, increment, originalOrderKeyValue, pathFromRoutes } from '../../../common/utils/functions'
import { SortSettings, SortTable } from '../../../common/utils/sort-table'
import { dragClass, tableTrSelectedClass } from '../../../layout/layout.constants'
import { TAB_MENU } from '../../../layout/layout.interfaces'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { FilesCompressionDialogComponent } from '../../files/components/dialogs/files-compression-dialog.component'
import { FilesNewDialogComponent } from '../../files/components/dialogs/files-new-dialog.component'
import { FilesTrashDialogComponent } from '../../files/components/dialogs/files-trash-dialog.component'
import { FilesTrashEmptyDialogComponent } from '../../files/components/dialogs/files-trash-empty-dialog.component'
import { FileLockFormatPipe } from '../../files/components/utils/file-lock.utils'
import { FilePermissionsComponent } from '../../files/components/utils/file-permissions.component'
import { FileEvent } from '../../files/interfaces/file-event.interface'
import { FileModel } from '../../files/models/file.model'
import { FilesUploadService } from '../../files/services/files-upload.service'
import { FilesService } from '../../files/services/files.service'
import { LinkDialogComponent } from '../../links/components/dialogs/link-dialog.component'
import { ShareLinkModel } from '../../links/models/share-link.model'
import { ShareDialogComponent } from '../../shares/components/dialogs/share-dialog.component'
import { ShareModel } from '../../shares/models/share.model'
import { SYNC_ICON, SYNC_PATH } from '../../sync/sync.constants'
import { UserAvatarComponent } from '../../users/components/utils/user-avatar.component'
import { SpaceModel } from '../models/space.model'
import { SpacesBrowserService } from '../services/spaces-browser.service'
import { SPACES_ICON, SPACES_PATH } from '../spaces.constants'
import { SpaceAnchorFileDialogComponent } from './dialogs/space-anchor-file-dialog.component'

@Component({
  selector: 'app-spaces-browser',
  imports: [
    L10nTranslatePipe,
    L10nTranslateDirective,
    FaIconComponent,
    TooltipModule,
    BsDropdownModule,
    FilterComponent,
    ToBytesPipe,
    ContextMenuModule,
    VirtualScrollComponent,
    InputEditDirective,
    NavigationViewComponent,
    NgTemplateOutlet,
    KeyValuePipe,
    SearchFilterPipe,
    UserAvatarComponent,
    UploadFilesDirective,
    FilePermissionsComponent,
    TapDirective,
    FileLockFormatPipe
  ],
  templateUrl: 'spaces-browser.component.html'
})
export class SpacesBrowserComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(VirtualScrollComponent) scrollView: { element: ElementRef; viewPortItems: FileModel[]; scrollInto: (arg: FileModel | number) => void }
  @ViewChild(FilterComponent, { static: true }) inputFilter: FilterComponent
  @ViewChild(NavigationViewComponent, { static: true }) btnNavigationView: any
  @ViewChild('MainContextMenu', { static: true }) mainContextMenu: ContextMenuComponent<any>
  @ViewChild('MainReadOnlyContextMenu', { static: true }) mainReadOnlyContextMenu: ContextMenuComponent<any>
  @ViewChild('FileContextMenu', { static: true }) fileContextMenu: ContextMenuComponent<any>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  // Static
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARES: SPACES_ICON.SHARES,
    TRASH: SPACES_ICON.TRASH,
    PERSONAL: SPACES_ICON.PERSONAL,
    LINKS: SPACES_ICON.LINKS,
    SYNC: SYNC_ICON.SYNC,
    faArrowRotateRight,
    faPlus,
    faFileAlt,
    faGlobe,
    faUpload,
    faDownload,
    faLink,
    faAnchor,
    faEllipsis,
    faPen,
    faEye,
    faFolderOpen,
    faRotate,
    faCommentDots,
    faFileArchive,
    faSpellCheck,
    faArrowsAlt,
    faCircleInfo,
    faBan,
    faArrowUp,
    faArrowDown,
    faLock,
    faLockOpen,
    faClipboardList
  }
  // States
  protected loading = false
  protected locationNotFound = false
  protected forbiddenResource = false
  protected serverError = false
  protected isFilesRepo: boolean
  protected isSharesRepo: boolean
  protected isTrashRepo: boolean
  protected inRootSpace: boolean
  protected inSharesList: boolean
  protected hasRoots = false
  protected canShare: { inside: boolean; outside: boolean } = { inside: false, outside: false }
  protected spacePermissions: string
  // Actions
  protected multipleSelection = false
  protected hasSelection = false
  protected hasDisabledItemsInSelection = false
  protected canCompress = true
  protected renamingInProgress = false
  // Upload
  protected supportUploadFolder = false
  // Settings
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly TAB_MENU = TAB_MENU
  protected tableHeaders: Record<'name' | 'anchored' | 'info' | 'permissions' | 'size' | 'mtime', TableHeaderConfig> = {
    name: {
      label: 'Name',
      width: 45,
      textCenter: false,
      class: '',
      show: true,
      sortable: true
    },
    anchored: {
      label: 'Anchored by',
      width: 5,
      class: 'd-none d-md-table-cell',
      textCenter: true,
      show: this.hasRoots,
      sortable: true
    },
    info: { label: 'Info', width: 15, textCenter: true, class: 'd-none d-md-table-cell', show: true },
    permissions: {
      label: 'Permissions',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: this.hasRoots
    },
    size: {
      label: 'Size',
      width: 10,
      textCenter: true,
      class: 'd-none d-lg-table-cell',
      show: true,
      sortable: true
    },
    mtime: {
      label: 'Modified',
      width: 10,
      textCenter: true,
      class: 'd-none d-sm-table-cell',
      newly: 'newly',
      show: true,
      sortable: true
    }
  }
  protected btnSortFields = { name: 'Name', isDir: 'Type', size: 'Size', mtime: 'Modified' }
  protected galleryMode: ViewMode
  // Data
  protected files: FileModel[] = []
  protected selection: FileModel[] = []
  protected stats = { dirs: 0, files: 0, size: 0, elements: 0 }
  private readonly router = inject(Router)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly zone = inject(NgZone)
  private readonly renderer = inject(Renderer2)
  private readonly store = inject(StoreService)
  protected isElectronApp = this.store.isElectronApp()
  private readonly spacesBrowser = inject(SpacesBrowserService)
  private readonly filesService = inject(FilesService)
  private readonly filesUpload = inject(FilesUploadService)
  // Space
  private baseRepoUrl: string
  private currentRoute: string
  private isPersonalSpace: boolean
  private uploadButtonsShowed = false
  // Others
  private subscriptions: Subscription[] = []
  private focusOnSelect: string
  // Sort
  private readonly sortSettings: SortSettings = {
    default: [
      { prop: 'name', type: 'string' },
      { prop: 'isDir', type: 'number' }
    ],
    name: [{ prop: 'name', type: 'string' }],
    isDir: [{ prop: 'isDir', type: 'number' }],
    anchored: [
      { prop: 'root.id', type: 'number' },
      { prop: 'root.owner.fullName', type: 'string' }
    ],
    size: [{ prop: 'size', type: 'number' }],
    mtime: [{ prop: 'mtime', type: 'number' }]
  }
  protected sortTable = new SortTable(this.constructor.name, this.sortSettings)
  // DnD part
  private eventDragOverHandler: () => void | undefined
  private eventDragEnterHandler: () => void | undefined
  private eventDragStartHandler: () => void | undefined
  private eventDragLeaveHandler: () => void | undefined
  private eventDragEndHandler: () => void | undefined
  private eventDropHandler: () => void | undefined
  private eventKeysHandler: () => void | undefined
  private moveFromDrag = false

  ngOnInit() {
    this.galleryMode = this.btnNavigationView.currentView()
    this.supportUploadFolder = this.filesUpload.supportUploadDirectory
    this.activatedRoute.queryParams.subscribe((params) => this.focusOn(params.select))
    this.activatedRoute.data.subscribe((route: Data) => this.setSpace(route as { repository: SPACE_REPOSITORY; routes: UrlSegment[] }))
    this.subscriptions.push(this.store.filesOnEvent.subscribe((update: FileEvent) => this.onFileEvent(update)))
  }

  ngAfterViewInit() {
    setTimeout(() => this.initEventHandlers(), 500)
  }

  ngOnDestroy() {
    this.destroyEventHandlers()
    this.resetFilesSelection()
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress(ev: any) {
    if (!((ev.target.id === 'table-files' || ev.target.id === 'thumb-files') && (ev.ctrlKey || ev.metaKey))) {
      return
    }
    switch (ev.which || ev.keyCode) {
      case 65:
        // ctrl/cmd + a
        // select all
        ev.preventDefault()
        ev.stopPropagation()
        this.updateSelection(this.files)
        return
      case 67:
      case 88:
        // ctrl/cmd + c || ctrl/cmd + x
        ev.preventDefault()
        ev.stopPropagation()
        if (this.selection.length) {
          this.filesService.clipboardAction = ev.keyCode == 67 ? 'copyPaste' : 'cutPaste'
          this.filesService.addToClipboard(this.selection)
        }
        return
      case 86:
        // ctrl/cmd + v
        ev.preventDefault()
        ev.stopPropagation()
        this.filesService.onPasteClipboard()
        return
      default:
        return
    }
  }

  loadFiles() {
    this.loading = true
    this.forbiddenResource = false
    this.locationNotFound = false
    this.serverError = false
    this.inputFilter.clear()
    this.resetFilesSelection()
    this.spacesBrowser.loadFiles().subscribe({
      next: (spacesFiles: SpaceFiles) => {
        this.spacePermissions = spacesFiles.permissions
        this.canShare.outside = this.spacePermissions.indexOf(SPACE_OPERATION.SHARE_OUTSIDE) > -1
        // todo: share inside is not used, this should allow the file anchor dialog to add a personal file to the current space (?)
        this.canShare.inside = this.spacePermissions.indexOf(SPACE_OPERATION.SHARE_INSIDE) > -1
        this.hasRoots = spacesFiles.hasRoots
        this.tableHeaders.anchored.show = spacesFiles.hasRoots
        this.tableHeaders.anchored.label = this.isSharesRepo ? 'Owner' : 'Anchored by'
        this.tableHeaders.anchored.width = 10
        this.tableHeaders.permissions.show = spacesFiles.hasRoots
        this.sortBy(
          this.sortTable.sortParam.column,
          false,
          spacesFiles.files.map((f: FileProps) => new FileModel(f, this.baseRepoUrl, this.isSharesRepo, this.store.server().fileEditors))
        )
        this.updateFilesStats(this.files)
        this.loading = false
        if (this.focusOnSelect) {
          this.focusOn(this.focusOnSelect)
        } else {
          this.scrollView.scrollInto(-1)
        }
      },
      error: (e: HttpErrorResponse) => {
        this.files = []
        this.updateFilesStats(this.files)
        if (e.status !== 401) {
          this.forbiddenResource = e.status === 403
          this.locationNotFound = e.status === 404
          this.serverError = e.status === 0
          this.layout.sendNotification('error', 'Files', e.error.message)
        }
        this.loading = false
      }
    })
  }

  sortBy(column: string, toUpdate = true, collection?: FileModel[]) {
    this.files = this.sortTable.sortBy(column, toUpdate, collection || this.files)
  }

  switchView(view: ViewMode) {
    const oldView = this.galleryMode
    this.galleryMode = view
    if (this.galleryMode.enabled !== oldView.enabled) {
      this.destroyEventHandlers()
      setTimeout(() => this.initEventHandlers(), 500)
    }
  }

  onSelect(ev: MouseEvent, file: FileModel) {
    if (this.loading) {
      return
    }
    if (ev.shiftKey && this.selection.length > 0 && this.selection.indexOf(file) === -1) {
      this.selectRangeFiles(file)
    } else if (!ev.ctrlKey && !ev.metaKey) {
      this.updateSelection([file])
    } else {
      this.modifySelection(file)
    }
  }

  onContextMenu(ev: MouseEvent | Event) {
    ev.preventDefault()
    ev.stopPropagation()
    if (!this.isTrashRepo) {
      this.layout.openContextMenu(ev, this.mainContextMenu)
    }
  }

  onTargetContextMenu(ev: MouseEvent | Event, file: FileModel) {
    ev.preventDefault()
    if (ev.type === 'contextmenu') {
      ev.stopPropagation()
    }
    if (this.selection.length <= 1) {
      this.updateSelection([file])
    }
    this.layout.openContextMenu(ev, this.fileContextMenu)
  }

  browse(file: FileModel) {
    if (file.isDisabled) {
      this.layout.sendNotification('warning', file.name, 'Share is disabled')
      return
    }
    if (!file.isRenamed) {
      if (file.isDir) {
        this.router.navigate([file.root?.alias || file.name], { relativeTo: this.activatedRoute }).catch(console.error)
      } else {
        this.shortcutOpen()
      }
    }
  }

  copyMoveFiles() {
    this.layout.showRSideBarTab(TAB_MENU.TREE, true)
    setTimeout(() => this.filesService.treeCopyMoveOn.next(), 100)
  }

  downloadFiles() {
    if (this.multipleSelection) {
      this.openCompressionDialog(false)
    } else {
      this.filesService.download(this.selection[0])
    }
  }

  shortcutOpen() {
    if (this.selection[0].isDir) {
      this.browse(this.selection[0])
    } else if (this.selection[0].isViewable || this.selection[0].isEditable) {
      this.openViewerDialog()
    } else {
      this.downloadFiles()
    }
  }

  shortcutUploadFiles() {
    if (!this.uploadButtonsShowed) {
      const newButton = document.getElementById('newButton')
      newButton.click()
    }
    setTimeout(() => document.getElementById('uploadFilesButton').click(), 100)
  }

  shortcutUploadFolders() {
    if (!this.uploadButtonsShowed) {
      const newButton = document.getElementById('newButton')
      newButton.click()
      newButton.click()
    }
    setTimeout(() => document.getElementById('uploadFoldersButton').click(), 100)
  }

  shortcutRename() {
    this.selection[0].isRenamed = !this.selection[0].isRenamed
  }

  async renameFile(ev: { object: FileModel; name: string }) {
    const f: FileModel = ev.object
    const renamedTo = ev.name
    let overwrite = false
    const fileExists: FileModel = this.files.find((file) => file.name.toLowerCase() === renamedTo.toLowerCase() && file.id !== f.id)
    if (fileExists) {
      overwrite = await this.filesService.openOverwriteDialog([f], renamedTo)
      if (!overwrite) return
    }
    this.filesService
      .rename(f, renamedTo, overwrite)
      .pipe(take(1))
      .subscribe({
        next: (dto: Pick<FileTask, 'name'>) => {
          f.rename(dto.name)
          f.isEditable = false
          if (overwrite) {
            f.updateMime(fileExists.mime)
            this.sortBy(
              this.sortTable.sortParam.column,
              false,
              this.files.filter((file) => file.id !== fileExists.id)
            )
          }
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Rename', f.name, e)
      })
  }

  setRenamingInProgress(ev: boolean) {
    this.renamingInProgress = ev
  }

  addToSync() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_CLIENT], { state: { file: this.selection[0] } }).catch(console.error)
  }

  addToClipboard() {
    this.filesService.addToClipboard(this.selection)
  }

  openShareDialog() {
    const f: Partial<FileSpace> = this.setFilePermissionsAndSpace()
    if (f === null) return
    const modalRef: BsModalRef<ShareDialogComponent> = this.layout.openDialog(ShareDialogComponent, 'lg', {
      initialState: {
        file: f,
        isSharesRepo: this.isSharesRepo,
        inSharesList: this.inSharesList,
        allowFilesOptions: false
      } as ShareDialogComponent
    })
    modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['add' | string, ShareModel]) => {
      const s = r[1]
      if (this.selection[0].id < 0) this.selection[0].id = s.file.id
      this.selection[0].shares.push({ id: s.id, alias: s.alias, name: s.name, type: SHARE_TYPE.COMMON })
    })
  }

  openShareLinkDialog() {
    const f: Partial<FileSpace> = this.setFilePermissionsAndSpace()
    if (f === null) return
    const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
      initialState: {
        file: f,
        isSharesRepo: this.isSharesRepo,
        inSharesList: this.inSharesList
      } as LinkDialogComponent
    })
    modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete', ShareLinkModel] | ['add', ShareModel]) => {
      const [action, s] = r
      if (action === 'add') {
        if (this.selection[0].id < 0) this.selection[0].id = s.file.id
        this.selection[0].links.push({ id: s.id, alias: s.alias, name: s.name, type: SHARE_TYPE.LINK })
      }
    })
  }

  openSpaceAnchorFileDialog() {
    const modalRef: BsModalRef<SpaceAnchorFileDialogComponent> = this.layout.openDialog(SpaceAnchorFileDialogComponent, 'lg', {
      initialState: { files: this.selection } as SpaceAnchorFileDialogComponent
    })
    modalRef.content.addAnchoredFiles.pipe(take(1)).subscribe((up: { space: SpaceModel; rootFiles: { id: number; name: string }[] }) => {
      for (const f of this.selection) {
        const rootFile = up.rootFiles.find((rf: { id: number; name: string }) => rf.name === f.name)
        if (rootFile && f.spaces.map((s: Partial<SpaceModel>) => s.id).indexOf(up.space.id) === -1) {
          if (f.id < 0) f.id = rootFile.id
          f.spaces.push(up.space)
        }
      }
    })
  }

  initUpload() {
    if (!this.isTrashRepo && !this.uploadButtonsShowed) {
      this.uploadButtonsShowed = true
    }
  }

  async onUploadFiles(ev: { files: File[] }, isDirectory = false) {
    let overwrite = false
    const selectedFiles = [...ev.files]
    if (isDirectory) {
      const dirName = selectedFiles[0].webkitRelativePath.split('/')[0].normalize()
      const dirExists = this.files.find((f) => f.name.normalize().toLowerCase() === dirName.normalize().toLowerCase())
      if (dirExists) {
        overwrite = await this.filesService.openOverwriteDialog([dirExists])
        if (!overwrite) return
      }
    } else {
      const exist: FileModel[] = this.files.filter((x: FileModel) =>
        selectedFiles.some((f) => f.name.normalize().toLowerCase() === x.name.normalize().toLowerCase())
      )
      if (exist.length > 0) {
        overwrite = await this.filesService.openOverwriteDialog(exist)
        if (!overwrite) return
      }
    }
    this.filesUpload.addFiles(selectedFiles, overwrite).catch(console.error)
  }

  onDropFiles(ev: { dataTransfer: { files: File[] } }) {
    const exist: FileModel[] = this.files.filter((x: FileModel) =>
      [...ev.dataTransfer.files].some((f) => f.name.normalize().toLowerCase() === x.name.normalize().toLowerCase())
    )
    this.filesUpload.onDropFiles(ev, exist)
  }

  decompressFile() {
    this.filesService.decompress(this.selection[0])
  }

  openCompressionDialog(inDir = true) {
    const archiveProps: CompressFileDto = {
      name: this.selection[0].name,
      compressInDirectory: this.inSharesList ? false : inDir,
      files: this.selection.map((f: FileModel) => ({ name: f.name, rootAlias: f.root?.alias })),
      extension: tarExtension
    }
    this.layout.openDialog(FilesCompressionDialogComponent, null, {
      initialState: {
        archiveProps: archiveProps,
        disableInDirCompression: this.inSharesList
      } as FilesCompressionDialogComponent
    })
  }

  openNewDialog(type: 'file' | 'directory' | 'download') {
    this.layout.openDialog(FilesNewDialogComponent, null, { initialState: { files: this.files, inputType: type } as FilesNewDialogComponent })
  }

  openEmptyTrashDialog() {
    if (this.isTrashRepo && this.inRootSpace) {
      this.layout.openDialog(FilesTrashEmptyDialogComponent, null, { initialState: { files: this.files } as FilesTrashEmptyDialogComponent })
    }
  }

  openTrashDialog(permanently = false) {
    if (!this.selection.length) return
    const modalRef: BsModalRef<FilesTrashDialogComponent> = this.layout.openDialog(FilesTrashDialogComponent, null, {
      initialState: {
        files: this.selection,
        permanently: permanently
      } as FilesTrashDialogComponent
    })
    modalRef.content.removeFiles.pipe(take(1)).subscribe(() => this.removeFiles())
  }

  openLockDialog(f: FileModel) {
    this.filesService.openLockDialog(f)
  }

  private setSpace(route: { repository: SPACE_REPOSITORY; routes: UrlSegment[] }) {
    this.currentRoute = this.filesService.currentRoute = `${route.repository}${pathFromRoutes(route.routes)}`
    this.baseRepoUrl = `${route.repository}${route.routes.length ? `/${route.routes[0].path}` : ''}`
    this.isFilesRepo = route.repository === SPACES_PATH.FILES
    this.isSharesRepo = route.repository === SPACES_PATH.SHARES
    this.isTrashRepo = route.repository === SPACES_PATH.TRASH
    this.inRootSpace = this.isSharesRepo ? route.routes.length === 0 : route.routes.length === 1
    this.inSharesList = this.isSharesRepo && this.inRootSpace
    this.spacesBrowser.setEnvironment(route.repository, route.routes)
    this.isPersonalSpace = this.spacesBrowser.inPersonalSpace
    this.loadFiles()
  }

  private onFileEvent(ev: FileEvent) {
    if (ev.archiveId) {
      this.filesService.downloadTaskArchive(ev.archiveId)
      return
    }
    const matchDstPath = ev?.fileDstPath === this.currentRoute
    if (ev.filePath === this.currentRoute || matchDstPath) {
      // special case on move task, the src is removed, the dst is added
      const mustReloadFocus = matchDstPath && ev.reloadFocusOnDst
      if (ev.fileName) {
        if (ev.focus || mustReloadFocus) this.focusOnSelect = ev.fileName
        if (ev.delete && !mustReloadFocus) {
          if (ev.status === FileTaskStatus.SUCCESS) {
            this.files = this.files.filter((file: FileModel) => file.name !== ev.fileName)
            this.updateFilesStats(this.files)
            this.resetFilesSelection()
          } else {
            const file = this.files.find((file: FileModel) => file.name === ev.fileName)
            if (file) {
              file.isBeingDeleted = false
            }
          }
        }
      }
      if (ev.reload || mustReloadFocus) this.loadFiles()
    }
  }

  private removeFiles() {
    const selection = this.selection.filter((f: FileModel) => !f.root?.alias)
    if (this.selection.length !== selection.length) {
      this.layout.sendNotification('warning', 'Remove', 'You can not remove an anchored file')
    }
    // process other files
    if (selection.length) {
      this.filesService.delete(selection)
    }
  }

  private setFilePermissionsAndSpace(): Partial<FileSpace> {
    if (this.selection[0]?.root && this.selection[0].root.permissions.indexOf(SPACE_OPERATION.SHARE_OUTSIDE) === -1) {
      // Space case, if the file is a space root without the share outside permissions
      this.layout.sendNotification('warning', this.selection[0].name, 'You do not have share permission')
      return null
    }
    const f: Partial<FileSpace> = { ...this.selection[0] }
    if (this.isPersonalSpace) {
      f.permissions = this.spacePermissions
    } else if (this.selection[0]?.root) {
      f.permissions = this.selection[0].root.permissions
      if (this.inSharesList) {
        f.space = { alias: this.selection[0].root.alias, name: this.selection[0].root.alias, root: undefined }
      } else {
        const spaceAlias = this.currentRoute.split('/')[1]
        f.space = { alias: spaceAlias, name: spaceAlias, root: { alias: this.selection[0].root.alias, name: this.selection[0].name } }
      }
    } else {
      f.permissions = this.spacePermissions
      const [spaceAlias, rootAlias] = this.currentRoute.split('/').slice(1, 3)
      f.space = { alias: spaceAlias, name: spaceAlias, root: { alias: rootAlias, name: rootAlias } }
    }
    return f
  }

  private openViewerDialog() {
    const f = this.selection[0]
    let permissions: string
    if (this.inSharesList) {
      permissions = f.root.permissions
    } else {
      permissions = f?.root ? intersectPermissions(this.spacePermissions, f?.root.permissions) : this.spacePermissions
    }
    this.filesService.openViewerDialog(f, this.files, permissions).catch(console.error)
  }

  private focusOn(selectName: string) {
    if (!selectName) {
      this.focusOnSelect = null
      return
    }
    if (!this.files.length) {
      // wait for the `loadFiles`
      this.focusOnSelect = selectName
      return
    }
    let f = this.files.find((file) => file.name.toLowerCase() === selectName.toLowerCase())
    if (!f && this.hasRoots) {
      f = this.files.find((file) => file.root?.alias.toLowerCase() === selectName.toLowerCase())
    }
    if (f) {
      setTimeout(() => this.scrollView.scrollInto(f), 100)
      this.updateSelection([f])
    } else {
      // wait for the `loadFiles`
      this.focusOnSelect = selectName
    }
  }

  private updateFilesStats(files: FileModel[]) {
    this.stats = { dirs: 0, files: 0, size: 0, elements: 0 }
    for (const file of files) {
      this.updateCounters(file)
    }
  }

  private updateCounters(file: FileModel, added = true) {
    const op = added ? increment : decrement
    this.stats.elements = op(this.stats.elements, 1)
    this.stats.size = op(this.stats.size, file.size)
    if (file.isDir) {
      this.stats.dirs = op(this.stats.dirs, 1)
    } else {
      this.stats.files = op(this.stats.files, 1)
    }
  }

  private resetFilesSelection() {
    this.updateSelection([])
  }

  private modifySelection(file: FileModel) {
    if (!file) return
    if (file.isSelected) {
      this.updateSelection(this.selection.filter((f) => f.id !== file.id))
    } else {
      this.updateSelection([file, ...this.selection])
    }
  }

  private updateSelection(selection: FileModel[]) {
    if (selection.length) {
      this.selection = this.files.filter((file: FileModel) => {
        if (selection.indexOf(file) > -1) {
          file.isSelected = true
          return true
        }
        file.isSelected = false
        return false
      })
    } else {
      this.selection = this.selection.filter((file: FileModel) => {
        file.isSelected = false
        return false
      })
    }
    // update states
    this.hasSelection = !!this.selection.length
    this.hasDisabledItemsInSelection = !!this.selection.find((f: FileModel) => f.isDisabled)
    this.canCompress =
      !this.hasDisabledItemsInSelection && (this.selection.length > 1 || (this.selection.length === 1 && this.selection[0].isCompressible))
    this.multipleSelection = this.selection.length > 1 || (this.selection.length === 1 && this.selection[0].isDir)
    this.store.filesSelection.set(this.selection)
  }

  private selectRangeFiles(file: FileModel) {
    const fileIndex = this.files.indexOf(file)
    const currentIndexes: number[] = this.selection.map((f: FileModel) => this.files.indexOf(f))
    const finalSelection: FileModel[] = []
    const minIndex = Math.min(...currentIndexes)
    const maxIndex = Math.max(...currentIndexes)
    if (fileIndex < minIndex) {
      for (let i = fileIndex; i < minIndex; i++) {
        finalSelection.push(this.files[i])
      }
    } else if (fileIndex > maxIndex) {
      for (let i = fileIndex; i > maxIndex; i--) {
        finalSelection.push(this.files[i])
      }
    }
    this.updateSelection([...this.selection, ...finalSelection])
  }

  private initEventHandlers() {
    this.zone.runOutsideAngular(() => {
      this.eventDragOverHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'dragover', (ev): boolean | void => {
        if (this.inSharesList || (this.isTrashRepo && !this.moveFromDrag)) {
          ev.preventDefault()
          return false
        }
        if (['TD', 'TR', 'DIV', 'APP-VIRTUAL-SCROLL', 'IMG'].indexOf(ev.target.nodeName) > -1) {
          ev.preventDefault()
          if (this.moveFromDrag) {
            ev.dataTransfer.dropEffect = 'move'
          } else {
            ev.dataTransfer.dropEffect = 'copy'
          }
        }
      })
      this.eventDragStartHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'dragstart', (ev) => {
        if (this.inSharesList) {
          ev.preventDefault()
        }
        if (ev.target.parentElement.nodeName === 'TD' || ev.target.parentElement.nodeName === 'DIV') {
          const f: FileModel =
            this.scrollView.viewPortItems[
              this.galleryMode.enabled ? ev.target.parentElement.getAttribute('rowIndex') : ev.target.parentElement.parentElement.rowIndex
            ]
          if (f) {
            if (this.selection.indexOf(f) === -1) {
              this.zone.run(() => this.updateSelection([f]))
            }
            this.moveFromDrag = true
          }
        }
      })
      this.eventDragEnterHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'dragenter', (ev) => {
        ev.preventDefault()
        if (this.moveFromDrag && (ev.target.parentElement.nodeName === 'TD' || ev.target.parentElement.nodeName === 'DIV')) {
          const f =
            this.scrollView.viewPortItems[
              this.galleryMode.enabled ? ev.target.parentElement.getAttribute('rowIndex') : ev.target.parentElement.parentElement.rowIndex
            ]
          if (f && f.isDir && this.selection.indexOf(f) === -1) {
            if (ev.target.parentElement.nodeName === 'TD') {
              this.renderer.addClass(ev.target.parentElement, dragClass)
            } else if (ev.target.parentElement.classList.contains('card-body')) {
              this.renderer.addClass(ev.target.parentElement.parentElement, dragClass)
            }
          }
        }
      })
      this.eventDragLeaveHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'dragleave', (ev) => {
        ev.preventDefault()
        if (this.moveFromDrag) {
          if (ev.target.parentElement.nodeName === 'TD') {
            this.renderer.removeClass(ev.target.parentElement, dragClass)
          } else if (ev.target.parentElement.classList.contains('card-body')) {
            this.renderer.removeClass(ev.target.parentElement.parentElement, dragClass)
          }
        }
      })
      this.eventDragEndHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'dragend', (ev) => {
        ev.preventDefault()
        this.moveFromDrag = false
      })
      this.eventDropHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'drop', (ev): boolean | void => {
        if (this.inSharesList || (this.isTrashRepo && !this.moveFromDrag)) {
          ev.preventDefault()
          return false
        }
        if (this.moveFromDrag && (ev.target.parentElement.nodeName === 'TD' || ev.target.parentElement.nodeName === 'DIV')) {
          ev.preventDefault()
          const f: FileModel =
            this.scrollView.viewPortItems[
              this.galleryMode.enabled ? ev.target.parentElement.getAttribute('rowIndex') : ev.target.parentElement.parentElement.rowIndex
            ]
          if (f && f.isDir && this.selection.indexOf(f) === -1) {
            this.renderer.removeClass(ev.target.parentElement, dragClass)
            // start move action
            if (this.selection.length) {
              this.zone.run(() => this.filesService.copyMove(this.selection, f.path, FILE_OPERATION.MOVE))
            }
          }
        } else if (ev.dataTransfer.files.length) {
          ev.preventDefault()
          this.zone.run(() => this.onDropFiles(ev))
          return false
        } else {
          ev.preventDefault()
          return false
        }
      })
      this.eventKeysHandler = this.renderer.listen(this.scrollView.element.nativeElement, 'keydown', (ev) => {
        if (this.renamingInProgress) {
          return
        }
        let code = ev.keyCode || ev.which
        if ([37, 38, 39, 40].indexOf(code) === -1) {
          return
        } else if ((code === 37 || code === 39) && !this.galleryMode.enabled) {
          return
        }
        ev.preventDefault()
        ev.stopPropagation()
        let currentIndex: number
        const indexes = this.selection.map((f: FileModel) => this.files.indexOf(f))
        let galleryView = this.galleryMode.enabled
        if (code === 37) {
          galleryView = false
          code = 38
        } else if (code === 39) {
          galleryView = false
          code = 40
        }
        if (code === 38) {
          if (galleryView) {
            currentIndex =
              Math.min(...indexes) -
              Math.ceil(this.scrollView.element.nativeElement.offsetWidth / (this.galleryMode.dimensions + this.galleryMode.margins))
          } else {
            currentIndex = Math.min(...indexes) - 1
          }
          if (currentIndex <= -1) {
            currentIndex = this.files.length - 1
          }
        } else {
          if (galleryView) {
            currentIndex =
              Math.max(...indexes) +
              Math.ceil(this.scrollView.element.nativeElement.offsetWidth / (this.galleryMode.dimensions + this.galleryMode.margins))
          } else {
            currentIndex = Math.max(...indexes) + 1
          }
          if (currentIndex >= this.files.length) {
            currentIndex = 0
          }
        }
        const f: FileModel = this.files[currentIndex]
        this.zone.run(() => {
          if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
            this.updateSelection([f])
          } else {
            this.modifySelection(f)
          }
        })
        const selectedRows = this.scrollView.element.nativeElement.querySelectorAll(tableTrSelectedClass)
        if (selectedRows.length) {
          let element: HTMLElement
          if (code === 38) {
            element = selectedRows[0]
            if (!elementIsVisible(element)) {
              element.scrollIntoView(true)
            }
          } else {
            element = selectedRows[selectedRows.length - 1]
            if (!elementIsVisible(element)) {
              element.scrollIntoView(false)
            }
          }
        } else {
          setTimeout(() => this.scrollView.scrollInto(f), 0)
        }
      })
    })
  }

  private destroyEventHandlers() {
    for (const eventHandler of [
      this.eventDragStartHandler,
      this.eventDragOverHandler,
      this.eventDragEnterHandler,
      this.eventDragLeaveHandler,
      this.eventDragEndHandler,
      this.eventDropHandler,
      this.eventKeysHandler
    ].filter((evHandler: () => void) => evHandler)) {
      try {
        eventHandler()
      } catch (e) {
        console.warn(e)
      }
    }
  }
}
