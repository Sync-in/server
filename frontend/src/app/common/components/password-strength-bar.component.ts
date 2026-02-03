import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChange } from '@angular/core'

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
        <li class="point" [style.background-color]="bar0"></li>
        <li class="point" [style.background-color]="bar1"></li>
        <li class="point" [style.background-color]="bar2"></li>
        <li class="point" [style.background-color]="bar3"></li>
        <li class="point" [style.background-color]="bar4"></li>
      </ul>
    </div>
  `
})
export class PasswordStrengthBarComponent implements OnChanges {
  @Input() passwordToCheck = ''
  protected bar0 = ''
  protected bar1 = ''
  protected bar2 = ''
  protected bar3 = ''
  protected bar4 = ''

  private colors = ['#F00', '#F90', '#FF0', '#7ACC00', '#06854B']

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

  ngOnChanges(changes: Record<string, SimpleChange>) {
    const password = changes['passwordToCheck'].currentValue
    this.setBarColors(5, '#DDD')
    if (password) {
      const c = this.getColor(PasswordStrengthBarComponent.measureStrength(password))
      this.setBarColors(c.idx, c.col)
    }
  }

  private getColor(s: number) {
    // Compute index from 0 to 4 depending on s value (in steps of 10)
    const idx = Math.min(Math.floor((s - 1) / 10), 4)

    return {
      idx: idx + 1,
      col: this.colors[idx]
    }
  }

  private setBarColors(count: number, col: string) {
    for (let _n = 0; _n < count; _n++) {
      this[`bar${_n}`] = col
    }
  }
}
