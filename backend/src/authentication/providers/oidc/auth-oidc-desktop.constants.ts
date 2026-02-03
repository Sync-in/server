export const OAuthDesktopPortParam = 'desktop_port' as const
export const OAuthDesktopCallBackURI = '/oidc/callback' as const
export const OAuthDesktopLoopbackPorts = new Set<number>([49152, 49153, 49154])
