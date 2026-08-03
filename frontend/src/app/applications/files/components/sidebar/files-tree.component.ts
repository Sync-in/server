import { IActionMapping, ITreeOptions, TREE_ACTIONS, TreeModel, TreeModule, TreeNode } from '@ali-hm/angular-tree-component'
import { AsyncPipe } from '@angular/common'
import { Component, ElementRef, EventEmitter, inject, Input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFile } from '@fortawesome/free-regular-svg-icons'
import { faArrowRotateRight, faArrowsAlt, faClone, faFolder, faObjectGroup, faQuestion, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
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
import { resolveFileLocation } from '../../file-location.utils'
import { mimeDirectory } from '../../files.constants'
import type { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesSummaryComponent } from '../utils/files-summary.component'

@Component({
  selector: 'app-files-tree',
  imports: [AsyncPipe, AutoResizeDirective, TreeModule, L10nTranslateDirective, FaIconComponent, TapDirective, ToBytesPipe, FilesSummaryComponent],
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
  @Output() selected = new EventEmitter()
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
    faArrowRotateRight,
    faArrowsAlt,
    faClone,
    faTimes,
    faFolder,
    faFile,
    faObjectGroup,
    faQuestion,
    faSpinner
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
  private readonly copyMoveOnHeight = signal(0)
  private copyMovePanelResizeObserver: ResizeObserver | null = null
  private subscriptions: Subscription[] = []
  private preventDblClick = false
  private preventTimer: any

  constructor() {
    if (this.enableCopyMove) {
      this.subscriptions.push(toObservable(this.store.filesSelection).subscribe(() => this.checkAllowed(this.selection)))
    }
  }

  protected get treeResizeOffset() {
    return this.resizeOffset + (this.copyMoveOn ? this.copyMoveOnHeight() : 0)
  }

  get selection() {
    return this.filesService.treeNodeSelected
  }

  set selection(node: TreeNode) {
    this.filesService.treeNodeSelected = node
    if (node) {
      if ([0, -1, -2].indexOf(node.data.id) === -1) {
        this.selected.emit(node.data)
      } else {
        this.selected.emit(null)
      }
    }
  }

  ngOnInit() {
    this.initRoot()
    if (this.enableCopyMove) {
      this.subscriptions.push(
        this.filesService.treeCopyMoveOn.subscribe(() => {
          this.onCopyMove()
          this.filesService.consumeTreeCopyMove()
        })
      )
    }
    setTimeout(() => this.focusLastNode(), 100)
  }

  ngOnDestroy() {
    this.copyMovePanelResizeObserver?.disconnect()
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  onRefresh() {
    if (this.tree.treeModel.activeNodes.length) {
      this.tree.treeModel.activeNodes.forEach((node: TreeNode) => {
        node.loadNodeChildren().then(() => this.tree.treeModel.update())
      })
    } else {
      if (this.user.userHavePermission(USER_PERMISSION.PERSONAL_SPACE)) {
        this.tree.treeModel
          .getNodeById(0)
          .loadNodeChildren()
          .then(() => this.tree.treeModel.update())
      }
      if (this.user.userHavePermission(USER_PERMISSION.SPACES)) {
        this.tree.treeModel
          .getNodeById(-1)
          .loadNodeChildren()
          .then(() => this.tree.treeModel.update())
      }
      if (this.allowShares && this.user.userHavePermission(USER_PERMISSION.SHARES)) {
        this.tree.treeModel
          .getNodeById(-2)
          .loadNodeChildren()
          .then(() => this.tree.treeModel.update())
      }
    }
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
      repository: selection.data.inShare ? 'share' : undefined,
      excludeLeaf: true,
      displayLeafName: selection.parent?.data?.name
    })
  }

  private initRoot() {
    this.nodes = []
    if (this.user.userHavePermission(USER_PERMISSION.PERSONAL_SPACE)) {
      const node: FileTree | TreeNode = {
        id: 0,
        name: this.layout.translateString(SPACES_TITLE.PERSONAL_FILES),
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
        name: this.layout.translateString(SPACES_TITLE.SPACES),
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

  private focusLastNode() {
    if (this.selection) {
      this.selection = this.tree.treeModel.getNodeById(this.selection.data.id)
      if (this.selection) {
        TREE_ACTIONS.ACTIVATE(this.tree, this.selection, null)
      }
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
    node.data.isExpanded = !!node.data.isExpanded
  }

  private onOpen(node: TreeNode) {
    if (!this.copyMoveOn && this.enableNavigateTo && node.data.enabled) {
      clearTimeout(this.preventTimer)
      this.preventDblClick = true
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
    this.preventTimer = setTimeout(() => {
      this.checkAllowed(node)
      this.selection = node
      if (!this.preventDblClick) {
        if (node.hasChildren) {
          this.collapseChildren(node, node.parent.children)
          this.toggleExpand(tree, node, event)
        }
      }
      this.preventDblClick = false
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
