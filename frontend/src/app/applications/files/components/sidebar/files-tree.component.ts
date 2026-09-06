import { IActionMapping, ITreeOptions, TREE_ACTIONS, TreeModel, TreeModule, TreeNode } from '@ali-hm/angular-tree-component'
import { AsyncPipe } from '@angular/common'
import { Component, ElementRef, EventEmitter, inject, Injector, Input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  LucideCopy,
  LucideDynamicIcon,
  LucideFile,
  LucideFiles,
  LucideFolder,
  LucideLoader,
  LucideMove,
  LucideRotateCw,
  LucideX
} from '@lucide/angular'
import { FILE_OPERATION, FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import { SPACE_ALIAS, SPACE_ALL_OPERATIONS, SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TapDirective } from '../../../../common/directives/tap.directive'
import { ToBytesPipe } from '../../../../common/pipes/to-bytes.pipe'
import { defaultResizeOffset } from '../../../../layout/layout.constants'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH, SPACES_TITLE } from '../../../spaces/spaces.constants'
import { UserService } from '../../../users/user.service'
import { resolveFileLocation } from '../utils/file-location.utils'
import { mimeDirectory } from '../../files.constants'
import type { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesSummaryComponent } from '../utils/files-summary.component'

@Component({
  selector: 'app-files-tree',
  imports: [AsyncPipe, AutoResizeDirective, TreeModule, L10nTranslateDirective, LucideDynamicIcon, TapDirective, ToBytesPipe, FilesSummaryComponent],
  templateUrl: 'files-tree.component.html'
})
export class FilesTreeComponent implements OnInit, OnDestroy {
  @ViewChild('tree', { static: true }) tree: any
  @ViewChild('copyMovePanel')
  set copyMovePanel(panel: ElementRef<HTMLElement> | undefined) {
    this.copyMovePanelResizeObserver?.disconnect()
    if (!panel) return
    const element = panel.nativeElement
    this.copyMovePanelResizeObserver = new ResizeObserver(() => {
      const separator = element.nextElementSibling as HTMLElement | null
      this.copyMoveOnHeight.set(element.offsetHeight + (separator?.tagName === 'HR' ? separator.offsetHeight : 0))
    })
    this.copyMovePanelResizeObserver.observe(element)
  }
  @Output() selected = new EventEmitter<FileTree | null>()
  @Input() showFiles = false
  @Input() allowShares = true
  @Input() allowSpaces = true
  @Input() enableCopyMove = true
  @Input() enableNavigateTo = true
  @Input() sideBarHeader = true
  @Input() resizeOffset = defaultResizeOffset
  @Input() toggleNodesAtStartup = false
  protected readonly store = inject(StoreService)
  protected readonly icons = {
    LucideRotateCw,
    LucideMove,
    LucideCopy,
    LucideX,
    LucideFolder,
    LucideFile,
    LucideFiles,
    LucideLoader
  }
  protected readonly options: ITreeOptions = {
    actionMapping: {
      mouse: {
        click: (tree, node, $event) => this.onSelect(tree, node, $event),
        dblClick: (_tree, node) => this.onOpen(node),
        expanderClick: () => null
      }
    } as IActionMapping,
    animateExpand: false,
    levelPadding: 10,
    useVirtualScroll: false,
    nodeHeight: 36,
    dropSlotHeight: 0,
    allowDrag: false,
    allowDrop: false,
    getChildren: (node: TreeNode) => this.getTreeNode(node)
  }
  protected nodes: any[]
  protected copyMoveOn = false
  protected srcAllowed = true
  protected dstAllowed = true
  protected errorMsg = null
  private readonly layout = inject(LayoutService)
  private readonly router = inject(Router)
  private readonly user = inject(UserService)
  private readonly filesService = inject(FilesService)
  private readonly injector = inject(Injector)
  private readonly copyMoveOnHeight = signal(0)
  private copyMovePanelResizeObserver: ResizeObserver | null = null
  private readonly subscriptions: Subscription[] = []
  private focusTimer: ReturnType<typeof setTimeout> | undefined
  private preventTimer: ReturnType<typeof setTimeout> | undefined

  protected get treeResizeOffset() {
    return this.resizeOffset + (this.copyMoveOn ? this.copyMoveOnHeight() : 0)
  }

  get selection() {
    return this.filesService.treeNodeSelected
  }

  set selection(node: TreeNode) {
    this.filesService.treeNodeSelected = node
    this.selected.emit(node && ![0, -1, -2].includes(node.data.id) ? node.data : null)
  }

  ngOnInit() {
    this.initRoot()
    if (this.enableCopyMove) {
      this.subscriptions.push(
        toObservable(this.store.filesSelection, { injector: this.injector }).subscribe(() => this.checkAllowed(this.selection)),
        this.filesService.treeCopyMoveOn.subscribe(() => {
          this.onCopyMove()
          this.filesService.consumeTreeCopyMove()
        })
      )
    }
    this.focusTimer = setTimeout(() => {
      this.focusTimer = undefined
      this.focusLastNode()
    }, 100)
  }

  ngOnDestroy() {
    this.copyMovePanelResizeObserver?.disconnect()
    clearTimeout(this.focusTimer)
    clearTimeout(this.preventTimer)
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  onRefresh() {
    const activeNodes: TreeNode[] = this.tree.treeModel.activeNodes
    const nodesToRefresh: TreeNode[] = activeNodes.length ? activeNodes : this.tree.treeModel.roots
    const selectedPath = this.selection?.data.path
    Promise.allSettled(nodesToRefresh.map((node) => node.loadNodeChildren()))
      .then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') console.error(result.reason)
        }
        this.tree.treeModel.update()
        this.focusLastNode(selectedPath)
      })
      .catch(console.error)
  }

  actionCancel() {
    this.copyMoveOn = false
    this.errorMsg = null
    this.srcAllowed = true
    this.dstAllowed = true
  }

  actionCopy() {
    this.filesService.copyMove(this.store.filesSelection(), this.selection.data.path, FILE_OPERATION.COPY)
    this.copyMoveOn = false
  }

  actionMove() {
    this.filesService.copyMove(this.store.filesSelection(), this.selection.data.path, FILE_OPERATION.MOVE)
    this.copyMoveOn = false
  }

  getSizeLazy(file: FileModel) {
    return this.filesService.getSizeLazy(file)
  }

  get destinationLocation() {
    const selection = this.selection
    if (!selection) return null
    return resolveFileLocation(selection.data.path, {
      repository: selection.data.inShare ? FILE_REPOSITORY.SHARE : undefined,
      excludeLeaf: true,
      displayRootName: this.getRepositoryRootName(selection)
    })
  }

  private getRepositoryRootName(selection: TreeNode): string | undefined {
    let repositoryRoot = selection
    while (repositoryRoot.parent && ![0, -1, -2].includes(repositoryRoot.parent.data?.id)) repositoryRoot = repositoryRoot.parent
    return [-1, -2].includes(repositoryRoot.parent?.data?.id) ? repositoryRoot.data.name : undefined
  }

  private initRoot() {
    this.nodes = []
    if (this.user.userHavePermission(USER_PERMISSION.PERSONAL_SPACE)) {
      const node: FileTree | TreeNode = {
        id: 0,
        name: this.layout.translateString(SPACES_TITLE.PERSONAL_SPACE),
        path: `${SPACES_PATH.FILES}/${SPACE_ALIAS.PERSONAL}`,
        isDir: true,
        inShare: false,
        mime: mimeDirectory,
        quotaIsExceeded: this.store.user.getValue().quotaIsExceeded,
        enabled: true,
        permissions: SPACE_ALL_OPERATIONS,
        children: null,
        hasChildren: true,
        isExpanded: false
      }
      this.checkToggleNodeAtStartup(node, true)
    }
    if (this.allowSpaces && this.user.userHavePermission(USER_PERMISSION.SPACES)) {
      const node: FileTree | TreeNode = {
        id: -1,
        name: this.layout.translateString(SPACES_TITLE.COLLABORATIVE_SPACES),
        path: SPACES_PATH.SPACES,
        isDir: true,
        mime: mimeDirectory,
        inShare: false,
        hasChildren: true,
        quotaIsExceeded: false,
        enabled: true,
        permissions: '',
        children: null,
        isExpanded: false
      }
      this.checkToggleNodeAtStartup(node)
    }
    if (this.allowShares && this.user.userHavePermission(USER_PERMISSION.SHARES)) {
      const node: FileTree | TreeNode = {
        id: -2,
        name: this.layout.translateString(SPACES_TITLE.SHARES),
        path: SPACES_PATH.SHARES,
        isDir: true,
        mime: mimeDirectory,
        inShare: true,
        hasChildren: true,
        quotaIsExceeded: false,
        enabled: true,
        permissions: '',
        children: null,
        isExpanded: false
      }
      this.checkToggleNodeAtStartup(node)
    }
  }

  private checkToggleNodeAtStartup(node: any, unshift = false) {
    if (this.toggleNodesAtStartup) {
      this.getTreeNode(node).then((data) => {
        node.children = data
        if (unshift) {
          this.nodes.unshift(node)
        } else {
          this.nodes.push(node)
        }
        this.tree.treeModel.update()
        this.toggleExpand(this.tree, this.tree.treeModel.getNodeById(node.id), null)
      })
    } else {
      if (unshift) {
        this.nodes.unshift(node)
      } else {
        this.nodes.push(node)
      }
      this.tree.treeModel.update()
    }
  }

  private focusLastNode(path = this.selection?.data.path) {
    if (!path) return
    const selection = this.tree.treeModel.getNodeBy((node: TreeNode) => node.data.path === path) || null
    this.selection = selection
    if (selection) {
      TREE_ACTIONS.ACTIVATE(this.tree, selection, null)
    }
  }

  private getTreeNode(node: any): Promise<any> {
    return this.filesService.getTreeNode(node?.data?.path || node?.path || node, this.showFiles)
  }

  private collapseChildren(node: TreeNode, children: TreeNode[]) {
    for (const child of children) {
      // ignore auto collapse
      // if ([0, -1, -2].indexOf(child.id) === -1 && child.id !== node.id)
      if (child.id !== node.id) {
        child.data.isExpanded = false
        child.collapse()
      }
    }
  }

  private toggleExpand(tree: TreeModel, node: TreeNode, event: any) {
    TREE_ACTIONS.TOGGLE_EXPANDED(tree, node, event)
    node.data.isExpanded = node.isExpanded
  }

  private onOpen(node: TreeNode) {
    if (!this.copyMoveOn && this.enableNavigateTo && node.data.enabled) {
      clearTimeout(this.preventTimer)
      this.preventTimer = undefined
      this.selection = node
      const urlSegments = node.data.path.split('/')
      if (urlSegments[0] !== SPACES_PATH.SPACES) {
        urlSegments.unshift(SPACES_PATH.SPACES)
      }
      this.router.navigate(urlSegments).catch(console.error)
    }
  }

  private onSelect(tree: TreeModel, node: TreeNode, event: any) {
    if (!node.data.enabled) {
      this.layout.sendNotification('warning', node.data.name, `${node.data.inShare ? 'Share' : 'Space'} is disabled`)
      return
    }
    TREE_ACTIONS.ACTIVATE(tree, node, event)
    clearTimeout(this.preventTimer)
    this.preventTimer = setTimeout(() => {
      this.checkAllowed(node)
      this.selection = node
      if (node.hasChildren) {
        this.collapseChildren(node, node.parent.children)
        this.toggleExpand(tree, node, event)
      }
      this.preventTimer = undefined
    }, 200)
  }

  private checkAllowed(node: TreeNode) {
    if (!this.copyMoveOn) return
    if (this.store.filesSelection().length) {
      for (const f of this.store.filesSelection()) {
        if (f.root?.alias) {
          this.errorMsg = 'You can not move an anchored file'
          this.srcAllowed = false
          this.dstAllowed = true
          return
        }
        if (f.lock && f.lock.owner.login !== this.store.user.getValue().login) {
          this.errorMsg = 'You can not move a locked file'
          this.srcAllowed = false
          this.dstAllowed = true
          return
        }
      }
    }
    if (node) {
      if ([-1, -2].indexOf(node.data.id) > -1) {
        this.errorMsg = null
        this.srcAllowed = true
        this.dstAllowed = false
        return
      } else if (node.data.permissions.indexOf(SPACE_OPERATION.ADD) === -1) {
        this.errorMsg = 'You are not allowed to write here'
        this.srcAllowed = true
        this.dstAllowed = false
        return
      } else if (node.data.quotaIsExceeded) {
        this.errorMsg = 'No more space available'
        this.srcAllowed = true
        this.dstAllowed = false
        return
      }
    }
    this.errorMsg = null
    this.srcAllowed = true
    this.dstAllowed = true
  }

  private onCopyMove() {
    this.onRefresh()
    this.copyMoveOn = true
    this.checkAllowed(this.selection)
  }
}
