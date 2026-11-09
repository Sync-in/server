import { AsyncPipe } from '@angular/common'
import {
  afterNextRender,
  AfterViewInit,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
  viewChildren
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  LucideChevronRight,
  LucideCopy,
  LucideDynamicIcon,
  LucideFile,
  LucideFiles,
  LucideFolder,
  LucideLayers,
  LucideLoader,
  LucideMove,
  LucideRotateCw,
  LucideShare2,
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
import type { FilesTreeNode } from './interfaces/files-tree-node.interface'
import { FilesSummaryComponent } from '../utils/files-summary.component'

@Component({
  selector: 'app-files-tree',
  imports: [AsyncPipe, AutoResizeDirective, L10nTranslateDirective, LucideDynamicIcon, TapDirective, ToBytesPipe, FilesSummaryComponent],
  templateUrl: 'files-tree.component.html'
})
export class FilesTreeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly copyMovePanel = viewChild<ElementRef<HTMLElement>>('copyMovePanel')
  private readonly treeRows = viewChildren<ElementRef<HTMLElement>>('treeRow')
  readonly selected = output<FileTree | null>()
  readonly showFiles = input(false)
  readonly allowShares = input(true)
  readonly allowSpaces = input(true)
  readonly enableCopyMove = input(true)
  readonly enableNavigateTo = input(true)
  readonly sideBarHeader = input(true)
  readonly resizeOffset = input(defaultResizeOffset)
  readonly toggleNodesAtStartup = input(false)
  private readonly destroyRef = inject(DestroyRef)
  private readonly filesService = inject(FilesService)
  protected readonly store = inject(StoreService)
  protected readonly icons = {
    LucideRotateCw,
    LucideMove,
    LucideCopy,
    LucideX,
    LucideFolder,
    LucideFile,
    LucideFiles,
    LucideChevronRight,
    LucideLayers,
    LucideShare2,
    LucideLoader
  }
  protected readonly nodes = signal<FilesTreeNode[]>([])
  protected readonly visibleNodes = computed(() => this.flattenNodes(this.nodes()))
  protected readonly activeNode = signal<FilesTreeNode | null>(null)
  protected readonly focusedNode = signal<FilesTreeNode | null>(null)
  protected readonly copyMoveOn = signal(false)
  protected readonly srcAllowed = signal(true)
  protected readonly dstAllowed = signal(true)
  protected readonly errorMsg = signal<string | null>(null)
  protected readonly selectedNode = this.filesService.treeNodeSelected
  private readonly layout = inject(LayoutService)
  private readonly router = inject(Router)
  private readonly user = inject(UserService)
  private readonly injector = inject(Injector)
  private readonly copyMoveOnHeight = signal(0)
  protected readonly treeResizeOffset = computed(() => this.resizeOffset() + (this.copyMoveOn() ? this.copyMoveOnHeight() : 0))
  protected readonly destinationLocation = computed(() => {
    const selection = this.selectedNode()
    if (!selection) return null
    return resolveFileLocation(selection.data.path, {
      repository: selection.data.inShare ? FILE_REPOSITORY.SHARE : undefined,
      excludeLeaf: true,
      displayRootName: this.getRepositoryRootName(selection)
    })
  })
  private readonly expandedPaths = new Set<string>()
  private readonly subscriptions: Subscription[] = []
  private focusTimer: ReturnType<typeof setTimeout> | undefined
  private preventTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    effect((onCleanup) => {
      const panel = this.copyMovePanel()
      if (!panel) return
      const element = panel.nativeElement
      const resizeObserver = new ResizeObserver(() => {
        const separator = element.nextElementSibling as HTMLElement | null
        this.copyMoveOnHeight.set(element.offsetHeight + (separator?.tagName === 'HR' ? separator.offsetHeight : 0))
      })
      resizeObserver.observe(element)
      onCleanup(() => resizeObserver.disconnect())
    })
  }

  private setSelection(node: FilesTreeNode | null) {
    this.selectedNode.set(node)
    this.selected.emit(node && ![0, -1, -2].includes(node.data.id) ? node.data : null)
  }

  ngOnInit() {
    if (this.enableCopyMove()) {
      this.subscriptions.push(
        toObservable(this.store.filesSelection, { injector: this.injector }).subscribe(() => {
          this.checkAllowed(this.selectedNode())
        }),
        this.filesService.treeCopyMoveOn.subscribe(() => {
          this.onCopyMove()
          this.filesService.consumeTreeCopyMove()
        })
      )
    }
  }

  ngAfterViewInit() {
    afterNextRender(
      () => {
        this.initRoot()
        this.focusTimer = setTimeout(() => {
          this.focusTimer = undefined
          this.focusLastNode()
        }, 100)
      },
      { injector: this.injector }
    )
  }

  ngOnDestroy() {
    clearTimeout(this.focusTimer)
    clearTimeout(this.preventTimer)
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  async onRefresh() {
    const activeNode = this.activeNode()
    const nodesToRefresh = activeNode ? [activeNode] : this.nodes()
    const selectedPath = this.selectedNode()?.data.path
    const results = await Promise.allSettled(nodesToRefresh.map((node) => this.loadChildren(node, true)))
    if (this.destroyRef.destroyed) return
    this.logRejected(results)
    this.focusLastNode(selectedPath)
  }

  actionCancel() {
    this.copyMoveOn.set(false)
    this.errorMsg.set(null)
    this.srcAllowed.set(true)
    this.dstAllowed.set(true)
  }

  actionCopy() {
    this.filesService.copyMove(this.store.filesSelection(), this.selectedNode()!.data.path, FILE_OPERATION.COPY)
    this.copyMoveOn.set(false)
  }

  actionMove() {
    this.filesService.copyMove(this.store.filesSelection(), this.selectedNode()!.data.path, FILE_OPERATION.MOVE)
    this.copyMoveOn.set(false)
  }

  getSizeLazy(file: FileModel) {
    return this.filesService.getSizeLazy(file)
  }

  protected isTreeRoot(node: FilesTreeNode) {
    return node.data.id === 0 || node.data.id === -1 || node.data.id === -2
  }

  protected getTreeNodeIcon(node: FilesTreeNode) {
    if (node.data.id === -1) return this.icons.LucideLayers
    if (node.data.id === -2) return this.icons.LucideShare2
    return node.data.isDir ? this.icons.LucideFolder : this.icons.LucideFile
  }

  private getRepositoryRootName(selection: FilesTreeNode): string | undefined {
    let repositoryRoot = selection
    while (repositoryRoot.parent && ![0, -1, -2].includes(repositoryRoot.parent.data?.id)) repositoryRoot = repositoryRoot.parent
    return [-1, -2].includes(repositoryRoot.parent?.data?.id) ? repositoryRoot.data.name : undefined
  }

  private initRoot() {
    const roots: FileTree[] = []
    if (this.user.userHavePermission(USER_PERMISSION.PERSONAL_SPACE)) {
      roots.push({
        id: 0,
        name: this.layout.translateString(SPACES_TITLE.PERSONAL_SPACE),
        path: `${SPACES_PATH.FILES}/${SPACE_ALIAS.PERSONAL}`,
        isDir: true,
        inShare: false,
        mime: mimeDirectory,
        quotaIsExceeded: this.store.user().quotaIsExceeded,
        enabled: true,
        permissions: SPACE_ALL_OPERATIONS,
        hasChildren: true
      })
    }
    if (this.allowSpaces() && this.user.userHavePermission(USER_PERMISSION.SPACES)) {
      roots.push({
        id: -1,
        name: this.layout.translateString(SPACES_TITLE.COLLABORATIVE_SPACES),
        path: SPACES_PATH.SPACES,
        isDir: true,
        mime: mimeDirectory,
        inShare: false,
        hasChildren: true,
        quotaIsExceeded: false,
        enabled: true,
        permissions: ''
      })
    }
    if (this.allowShares() && this.user.userHavePermission(USER_PERMISSION.SHARES)) {
      roots.push({
        id: -2,
        name: this.layout.translateString(SPACES_TITLE.SHARES),
        path: SPACES_PATH.SHARES,
        isDir: true,
        mime: mimeDirectory,
        inShare: true,
        hasChildren: true,
        quotaIsExceeded: false,
        enabled: true,
        permissions: ''
      })
    }

    const nodes = roots.map((root) => this.createNode(root, null))
    this.nodes.set(nodes)
    this.focusedNode.set(nodes[0] || null)
    if (this.toggleNodesAtStartup()) {
      void Promise.allSettled(nodes.map((node) => this.toggleExpand(node))).then((results) => this.logRejected(results))
    }
  }

  private focusLastNode(path = this.selectedNode()?.data.path) {
    if (!path) return
    const selection = this.findNodeByPath(path)
    const visibleNodes = this.visibleNodes()
    let focusTarget = selection
    while (focusTarget && !visibleNodes.includes(focusTarget)) focusTarget = focusTarget.parent
    this.activeNode.set(selection)
    if (focusTarget) this.focusNode(focusTarget, false)
    else this.focusedNode.set(this.nodes()[0] || null)
    this.setSelection(selection)
  }

  private createNode(data: FileTree, parent: FilesTreeNode | null): FilesTreeNode {
    return {
      data,
      parent,
      children: null,
      level: parent ? parent.level + 1 : 0,
      isExpanded: this.expandedPaths.has(data.path),
      isLoading: false,
      loadingPromise: null
    }
  }

  private flattenNodes(nodes: FilesTreeNode[]): FilesTreeNode[] {
    const visibleNodes: FilesTreeNode[] = []
    for (const node of nodes) {
      visibleNodes.push(node)
      if (node.isExpanded && node.children) visibleNodes.push(...this.flattenNodes(node.children))
    }
    return visibleNodes
  }

  private findNodeByPath(path: string, nodes = this.nodes()): FilesTreeNode | null {
    for (const node of nodes) {
      if (node.data.path === path) return node
      if (node.children) {
        const child = this.findNodeByPath(path, node.children)
        if (child) return child
      }
    }
    return null
  }

  private loadChildren(node: FilesTreeNode, refresh = false): Promise<void> {
    if (node.loadingPromise) return node.loadingPromise
    if (!refresh && node.children !== null) return Promise.resolve()

    node.isLoading = true
    this.refreshTree()
    node.loadingPromise = this.filesService
      .getTreeNode(node.data.path, this.showFiles())
      .then(async (children) => {
        node.children = children.map((child) => this.createNode(child, node))
        node.data.hasChildren = [0, -1, -2].includes(node.data.id) || node.children.length > 0
        if (!node.data.hasChildren) {
          node.isExpanded = false
          this.expandedPaths.delete(node.data.path)
        }
        await this.restoreExpandedNodes(node.children)
      })
      .finally(() => {
        node.isLoading = false
        node.loadingPromise = null
        this.refreshTree()
      })
    return node.loadingPromise
  }

  private toggleExpand(node: FilesTreeNode): Promise<void> {
    if (!node.data.hasChildren) return Promise.resolve()
    node.isExpanded = !node.isExpanded
    if (node.isExpanded) this.expandedPaths.add(node.data.path)
    else this.expandedPaths.delete(node.data.path)
    this.refreshTree()
    return node.isExpanded ? this.loadChildren(node) : Promise.resolve()
  }

  private collapseSiblings(node: FilesTreeNode) {
    const siblings = node.parent?.children || this.nodes()
    for (const sibling of siblings) {
      if (sibling !== node) {
        sibling.isExpanded = false
        this.expandedPaths.delete(sibling.data.path)
      }
    }
    this.refreshTree()
  }

  private refreshTree() {
    this.nodes.update((nodes) => [...nodes])
  }

  private async restoreExpandedNodes(nodes: FilesTreeNode[]): Promise<void> {
    const results = await Promise.allSettled(nodes.filter((node) => node.data.hasChildren && node.isExpanded).map((node) => this.loadChildren(node)))
    this.logRejected(results)
  }

  private logRejected(results: PromiseSettledResult<void>[]) {
    for (const result of results) {
      if (result.status === 'rejected') console.error(result.reason)
    }
  }

  protected onOpen(node: FilesTreeNode) {
    if (!this.copyMoveOn() && this.enableNavigateTo() && node.data.enabled) {
      clearTimeout(this.preventTimer)
      this.preventTimer = undefined
      this.activeNode.set(node)
      this.focusNode(node)
      this.setSelection(node)
      const urlSegments = node.data.path.split('/')
      if (urlSegments[0] !== SPACES_PATH.SPACES) {
        urlSegments.unshift(SPACES_PATH.SPACES)
      }
      this.router.navigate(urlSegments).catch(console.error)
    }
  }

  protected onSelect(node: FilesTreeNode) {
    if (!node.data.enabled) {
      this.layout.sendNotification('warning', node.data.name, `${node.data.inShare ? 'Share' : 'Space'} is disabled`)
      return
    }
    this.activeNode.set(node)
    this.focusNode(node)
    clearTimeout(this.preventTimer)
    this.preventTimer = setTimeout(() => {
      this.selectNode(node)
      this.preventTimer = undefined
    }, 200)
  }

  protected onTreeKeydown(event: KeyboardEvent, node: FilesTreeNode) {
    const visibleNodes = this.visibleNodes()
    const index = visibleNodes.indexOf(node)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (visibleNodes[index + 1]) this.focusNode(visibleNodes[index + 1])
        break
      case 'ArrowUp':
        event.preventDefault()
        if (visibleNodes[index - 1]) this.focusNode(visibleNodes[index - 1])
        break
      case 'ArrowRight':
        event.preventDefault()
        if (!node.data.hasChildren) return
        if (!node.isExpanded) this.toggleExpand(node).catch(console.error)
        else if (node.children?.length) this.focusNode(node.children[0])
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (node.isExpanded) this.toggleExpand(node).catch(console.error)
        else if (node.parent) this.focusNode(node.parent)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!node.data.enabled) {
          this.layout.sendNotification('warning', node.data.name, `${node.data.inShare ? 'Share' : 'Space'} is disabled`)
          return
        }
        this.activeNode.set(node)
        this.selectNode(node)
        break
    }
  }

  private selectNode(node: FilesTreeNode) {
    this.checkAllowed(node)
    this.setSelection(node)
    if (node.data.hasChildren) {
      this.collapseSiblings(node)
      this.toggleExpand(node).catch(console.error)
    }
  }

  private focusNode(node: FilesTreeNode, focus = true) {
    this.focusedNode.set(node)
    afterNextRender(
      () => {
        const index = this.visibleNodes().indexOf(node)
        const element = this.treeRows()[index]?.nativeElement
        if (focus) element?.focus()
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      },
      { injector: this.injector }
    )
  }

  private checkAllowed(node: FilesTreeNode | null) {
    if (!this.copyMoveOn()) return
    if (this.store.filesSelection().length) {
      for (const f of this.store.filesSelection()) {
        if (f.root?.alias) {
          this.errorMsg.set('You can not move an anchored file')
          this.srcAllowed.set(false)
          this.dstAllowed.set(true)
          return
        }
        if (f.lock && f.lock.owner.login !== this.store.user().login) {
          this.errorMsg.set('You can not move a locked file')
          this.srcAllowed.set(false)
          this.dstAllowed.set(true)
          return
        }
      }
    }
    if (node) {
      if ([-1, -2].indexOf(node.data.id) > -1) {
        this.errorMsg.set(null)
        this.srcAllowed.set(true)
        this.dstAllowed.set(false)
        return
      } else if (node.data.permissions.indexOf(SPACE_OPERATION.ADD) === -1) {
        this.errorMsg.set('You are not allowed to write here')
        this.srcAllowed.set(true)
        this.dstAllowed.set(false)
        return
      } else if (node.data.quotaIsExceeded) {
        this.errorMsg.set('No more space available')
        this.srcAllowed.set(true)
        this.dstAllowed.set(false)
        return
      }
    }
    this.errorMsg.set(null)
    this.srcAllowed.set(true)
    this.dstAllowed.set(true)
  }

  private onCopyMove() {
    void this.onRefresh()
    this.copyMoveOn.set(true)
    this.checkAllowed(this.selectedNode())
  }
}
