import { TooltipConfig } from 'ngx-bootstrap/tooltip'

export function getToolTipConfig(): TooltipConfig {
  // Touch devices emulate hover on tap and can leave tooltips open.
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  return Object.assign(new TooltipConfig(), {
    container: '.wrapper',
    adaptivePosition: false,
    triggers: supportsHover ? 'hover' : '',
    delay: 600
  })
}
