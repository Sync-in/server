import { computed, Injectable, Signal, signal, WritableSignal } from '@angular/core'
import { ALL_DOCUMENT_TYPES } from '@sync-in-server/backend/src/applications/files/constants/samples'
import type { SearchFilesDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import type { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { AppStoreManifest } from '@sync-in-server/backend/src/applications/sync/interfaces/store-manifest.interface'
import type { ServerConfig } from '@sync-in-server/backend/src/configuration/config.interfaces'
import { Subject } from 'rxjs'
import { CommentRecentModel } from '../applications/comments/models/comment-recent.model'
import { FileEvent } from '../applications/files/interfaces/file-event.interface'
import { FileContentModel } from '../applications/files/models/file-content.model'
import { FileRecentModel } from '../applications/files/models/file-recent.model'
import { FileModel } from '../applications/files/models/file.model'
import { ShareLinkModel } from '../applications/links/models/share-link.model'
import { NotificationModel } from '../applications/notifications/models/notification.model'
import { ShareFileModel } from '../applications/shares/models/share-file.model'
import { SpaceModel } from '../applications/spaces/models/space.model'
import { TrashModel } from '../applications/spaces/models/trash.model'
import { CLIENT_SCHEDULER_STATE } from '../applications/sync/constants/client'
import { SyncStatus } from '../applications/sync/interfaces/sync-status.interface'
import { SyncTask } from '../applications/sync/interfaces/sync-task.interface'
import { SyncPathModel } from '../applications/sync/models/sync-path.model'
import { UserType } from '../applications/users/interfaces/user.interface'
import { UserOnlineModel } from '../applications/users/models/user-online.model'
import { myAvatarUrl } from '../applications/users/user.functions'

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  public readonly server: WritableSignal<ServerConfig> = signal<ServerConfig>({
    twoFaEnabled: false,
    mailServerEnabled: false,
    files: {
      editors: { collabora: false, drawio: false, eurooffice: false, onlyoffice: false },
      sampleDocuments: ALL_DOCUMENT_TYPES
    }
  })
  public readonly user: WritableSignal<UserType> = signal<UserType>(null, { equal: () => false })
  public readonly userAvatarUrl: WritableSignal<string> = signal<string>(myAvatarUrl(), { equal: () => false })
  public readonly userImpersonate: WritableSignal<boolean> = signal<boolean>(false)
  public readonly isElectronApp: WritableSignal<boolean> = signal<boolean>(false)
  public readonly breadcrumb: WritableSignal<string> = signal<string>('', { equal: () => false })
  public readonly repository: WritableSignal<string> = signal<string>(null)
  // Files
  public readonly filesClipboard: WritableSignal<FileModel[]> = signal<FileModel[]>([], { equal: () => false })
  public readonly filesActiveTasks: WritableSignal<FileTask[]> = signal<FileTask[]>([], { equal: () => false })
  public readonly filesEndedTasks: WritableSignal<FileTask[]> = signal<FileTask[]>([], { equal: () => false })
  public readonly filesRecents: WritableSignal<FileRecentModel[]> = signal<FileRecentModel[]>([])
  // Search
  public readonly currentSearch: WritableSignal<SearchFilesDto> = signal<SearchFilesDto>({ content: '', fullText: false })
  public readonly filesSearch: WritableSignal<FileContentModel[]> = signal<FileContentModel[]>([])
  public readonly filesSearchScrollTop: WritableSignal<number> = signal<number>(0)
  public readonly filesSearchSelectedIndex: WritableSignal<number | null> = signal<number | null>(null)
  // Comments
  public readonly commentsRecents: WritableSignal<CommentRecentModel[]> = signal<CommentRecentModel[]>([])
  // Websocket
  public readonly onlineUsers: WritableSignal<UserOnlineModel[]> = signal<UserOnlineModel[]>([])
  // Notifications
  public readonly notifications: WritableSignal<NotificationModel[]> = signal<NotificationModel[]>([])
  public readonly unreadNotifications: Signal<NotificationModel[]> = computed(() => this.notifications().filter((n) => !n.wasRead))
  // Selections
  public readonly filesSelection: WritableSignal<FileModel[]> = signal<FileModel[]>([])
  public readonly shareSelection: WritableSignal<ShareFileModel> = signal<ShareFileModel>(null, { equal: () => false })
  public readonly linkSelection: WritableSignal<ShareLinkModel> = signal<ShareLinkModel>(null, { equal: () => false })
  public readonly spaceSelection: WritableSignal<SpaceModel> = signal<SpaceModel>(null, { equal: () => false })
  public readonly trashSelection: WritableSignal<TrashModel> = signal<TrashModel>(null)
  // Events
  public readonly filesOnEvent: Subject<FileEvent> = new Subject<FileEvent>()
  // Client
  public readonly clientScheduler: WritableSignal<CLIENT_SCHEDULER_STATE> = signal<CLIENT_SCHEDULER_STATE>(CLIENT_SCHEDULER_STATE.ASYNC)
  public readonly clientSyncPaths: WritableSignal<SyncPathModel[]> = signal([])
  public readonly clientSyncs: WritableSignal<SyncStatus[]> = signal<SyncStatus[]>([])
  public readonly clientSyncsWithErrors: WritableSignal<SyncStatus[]> = signal<SyncStatus[]>([], { equal: () => false })
  public readonly clientSyncIsReporting: WritableSignal<boolean> = signal<boolean>(false, { equal: () => false })
  public readonly clientSyncTask: WritableSignal<SyncTask> = signal<SyncTask>({ syncPathId: 0, nbTasks: 0 }, { equal: () => false })
  public readonly clientSyncTasksCount: WritableSignal<number> = signal<number>(0, { equal: () => false })
  // App store
  public readonly appStoreManifest: WritableSignal<AppStoreManifest> = signal(null)

  clean() {
    this.user.set(null)
    this.userImpersonate.set(false)
    this.breadcrumb.set('')
    this.repository.set(null)
    this.filesClipboard.set([])
    this.filesActiveTasks.set([])
    this.filesEndedTasks.set([])
    this.filesRecents.set([])
    this.currentSearch.set({ content: '', fullText: false })
    this.filesSearch.set([])
    this.filesSearchScrollTop.set(0)
    this.filesSearchSelectedIndex.set(null)
    this.commentsRecents.set([])
    // Websocket
    this.onlineUsers.set([])
    // Notifications
    this.notifications.set([])
    // Selections
    this.filesSelection.set([])
    this.shareSelection.set(null)
    this.linkSelection.set(null)
    this.spaceSelection.set(null)
    this.trashSelection.set(null)
    // Client
    this.clientScheduler.set(CLIENT_SCHEDULER_STATE.ASYNC)
    this.clientSyncPaths.set([])
    this.clientSyncs.set([])
    this.clientSyncsWithErrors.set([])
    this.clientSyncIsReporting.set(false)
    this.clientSyncTask.set({ syncPathId: 0, nbTasks: 0 })
    this.clientSyncTasksCount.set(0)
  }
}
