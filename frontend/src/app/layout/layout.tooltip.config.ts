import { TooltipConfig } from 'ngx-bootstrap/tooltip'

export function getToolTipConfig(): TooltipConfig {
  return Object.assign(new TooltipConfig(), {
    container: '.wrapper',
    adaptivePosition: false,
    triggers: 'hover',
    delay: 600
  })
}
