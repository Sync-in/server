import { KeyValuePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowDown, faArrowUp, faCog, faTh, faThLarge, faThList } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { LayoutService } from '../../../layout/layout.service'
import { originalOrderKeyValue } from '../../utils/functions'

export interface ViewMode {
  enabled: boolean
  text: string
  icon: IconDefinition
  dimensions?: number
  image?: number
  imageRes?: number
  faSize?: number
  textSize?: number
  margins?: number
}

@Component({
  selector: 'app-navigation-view',
  templateUrl: 'navigation-view.component.html',
  imports: [KeyValuePipe, BsDropdownModule, FaIconComponent, L10nTranslateDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationViewComponent {
  @Input() sortParams: { column: string; asc: boolean }
  @Input() sortFields: Record<string, string>
  @Output() switchView = new EventEmitter<ViewMode>()
  @Output() sortBy = new EventEmitter()
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { faCog, faArrowDown, faArrowUp }
  protected viewsMode: Record<string, ViewMode> = {
    tl: { enabled: false, text: 'List', icon: faThList },
    th: { enabled: true, text: 'S', icon: faTh, dimensions: 96, image: 56, imageRes: 128, faSize: 30, textSize: 11, margins: 18 },
    thM: { enabled: true, text: 'M', icon: faTh, dimensions: 112, image: 72, imageRes: 192, faSize: 34, textSize: 11, margins: 18 },
    thL: { enabled: true, text: 'L', icon: faTh, dimensions: 152, image: 112, imageRes: 256, faSize: 50, textSize: 12, margins: 18 },
    thXl: { enabled: true, text: 'XL', icon: faTh, dimensions: 192, image: 152, imageRes: 512, faSize: 65, textSize: 13, margins: 18 },
    thXxl: { enabled: true, text: 'XXL', icon: faThLarge, dimensions: 232, image: 192, imageRes: 1024, faSize: 80, textSize: 14, margins: 18 }
  }
  private readonly layout = inject(LayoutService)

  constructor() {
    this.viewsMode.tl.text = this.layout.translateString(this.viewsMode.tl.text)
  }

  get viewMode() {
    return localStorage.getItem('viewMode') || 'tl'
  }

  set viewMode(view: string) {
    localStorage.setItem('viewMode', view)
  }

  currentView() {
    return this.viewsMode[this.viewMode]
  }

  setView(view: string) {
    this.viewMode = view
    this.switchView.emit(this.viewsMode[view])
  }
}
