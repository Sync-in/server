import { AsyncPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { from } from 'rxjs'
import { concatMap, scan, startWith, switchMap } from 'rxjs/operators'
import { ToBytesPipe } from '../../../../common/pipes/to-bytes.pipe'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'

interface FilesSummarySize {
  size: number
  pendingDirectories: number
  hasError: boolean
}

@Component({
  selector: 'app-files-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, L10nTranslatePipe, ToBytesPipe],
  host: { class: 'd-block' },
  template: `
    @let fileStats = stats();
    @let sizeSummary = totalSize | async;
    <div class="app-small-card files-summary-card border rounded d-flex justify-content-center align-items-center text-nowrap fs-sm px-2 py-2">
      <span>
        <span class="text-bold">{{ fileStats.directories }}</span>
        {{ (fileStats.directories === 1 ? 'directory' : 'directories') | translate: locale.language }}
      </span>
      <span class="mx-2 lh-1 text-muted">•</span>
      <span>
        <span class="text-bold">{{ fileStats.files }}</span>
        {{ (fileStats.files === 1 ? 'file' : 'files') | translate: locale.language }}
      </span>
      @if (sizeSummary !== null) {
        <span class="mx-2 lh-1 text-muted">•</span>
        <span>
          @if (sizeSummary.pendingDirectories || sizeSummary.hasError) {
            ≥&nbsp;
          }
          {{ sizeSummary.size | toBytes: 0 : true }}
        </span>
      }
    </div>
  `
})
export class FilesSummaryComponent {
  readonly files = input.required<FileModel[]>()
  private readonly filesService = inject(FilesService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly stats = computed(() => {
    const files = this.files()
    const directories = files.filter((file) => file.isDir).length
    return { directories, files: files.length - directories }
  })
  protected readonly totalSize = toObservable(this.files).pipe(
    switchMap((files) => {
      const directories = files.filter((file) => file.isDir)
      const initial: FilesSummarySize = {
        size: files.reduce((size, file) => size + (file.isDir ? 0 : file.size), 0),
        pendingDirectories: directories.length,
        hasError: false
      }
      return from(directories).pipe(
        concatMap((directory) => this.filesService.getSizeLazy(directory)),
        scan(
          (total: FilesSummarySize, size: number | undefined): FilesSummarySize => ({
            size: total.size + (size ?? 0),
            pendingDirectories: total.pendingDirectories - 1,
            hasError: total.hasError || size === undefined
          }),
          initial
        ),
        startWith(initial)
      )
    })
  )
}
