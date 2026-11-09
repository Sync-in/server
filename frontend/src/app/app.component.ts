import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { ToastContainerComponent } from './common/components/toast/toast-container.component'

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  template: '<router-outlet></router-outlet><app-toast-container></app-toast-container>'
})
export class AppComponent {}
