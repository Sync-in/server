import { ChangeDetectionStrategy, Component, Input } from '@angular/core'

// Brand SVG paths from Font Awesome Free 7.3.1 by Fonticons, Inc.
// Icons licensed under CC BY 4.0: https://fontawesome.com/license/free
@Component({
  selector: 'app-platform-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './platform-icon.component.html',
  host: {
    class: 'platform-icon',
    'aria-hidden': 'true',
    '[style.font-size]': 'size'
  },
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        line-height: 1;
        vertical-align: -0.125em;
      }

      svg {
        display: block;
        width: 1em;
        height: 1em;
        fill: currentColor;
      }
    `
  ]
})
export class PlatformIconComponent {
  @Input({ required: true }) platform: string
  @Input() size: string = null

  protected get platformFamily(): 'apple' | 'windows' | 'linux' | null {
    const platform = this.platform?.toLowerCase()
    if (platform === 'darwin' || platform === 'mac') return 'apple'
    if (platform?.startsWith('win')) return 'windows'
    if (platform?.startsWith('linux')) return 'linux'
    return null
  }
}
