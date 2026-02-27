import { TooltipConfig } from 'ngx-bootstrap/tooltip'

export function getToolTipConfig(): TooltipConfig {
  return Object.assign(new TooltipConfig(), {
    adaptivePosition: false,
    triggers: 'hover',
    delay: 600
  })
}
