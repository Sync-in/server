import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

@Component({
  selector: 'app-password-strength-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      ul#strengthBar {
        display: flex;
        list-style: none;
        padding: 0;
        align-self: center;
        margin-bottom: -2px;
      }

      .point:last-child {
        margin: 0 !important;
      }

      .point {
        background: #ddd;
        border-radius: 2px;
        height: 6px;
        margin-right: 1px;
        width: 20px;
      }
    `
  ],
  template: `
    <div id="strength" #strength>
      <ul id="strengthBar">
        @for (color of barColors(); track $index) {
          <li class="point" [style.background-color]="color"></li>
        }
      </ul>
    </div>
  `
})
export class PasswordStrengthBarComponent {
  readonly passwordToCheck = input('')
  private readonly colors = ['#F00', '#F90', '#FF0', '#7ACC00', '#06854B']
  protected readonly barColors = computed(() => {
    const colors = Array<string>(5).fill('#DDD')
    const password = this.passwordToCheck()
    if (!password) return colors

    const color = this.getColor(PasswordStrengthBarComponent.measureStrength(password))
    return colors.map((defaultColor, index) => (index < color.idx ? color.col : defaultColor))
  })

  private static measureStrength(p: string) {
    let _force = 0
    const _regex = /[$-/:-?{-~!"^_`[\]]/g // "

    const _lowerLetters = /[a-z]+/.test(p)
    const _upperLetters = /[A-Z]+/.test(p)
    const _numbers = /[0-9]+/.test(p)
    const _symbols = _regex.test(p)

    const _flags = [_lowerLetters, _upperLetters, _numbers, _symbols]

    let _passedMatches = 0
    for (const _flag of _flags) {
      _passedMatches += _flag === true ? 1 : 0
    }

    _force += 2 * p.length + (p.length >= 10 ? 1 : 0)
    _force += _passedMatches * 10

    // penality (short password)
    _force = p.length <= 6 ? Math.min(_force, 10) : _force

    // penality (poor constituency of characters)
    _force = _passedMatches === 1 ? Math.min(_force, 10) : _force
    _force = _passedMatches === 2 ? Math.min(_force, 20) : _force
    _force = _passedMatches === 3 ? Math.min(_force, 40) : _force

    return _force
  }

  private getColor(s: number) {
    // Compute index from 0 to 4 depending on s value (in steps of 10)
    const idx = Math.min(Math.floor((s - 1) / 10), 4)

    return {
      idx: idx + 1,
      col: this.colors[idx]
    }
  }
}
