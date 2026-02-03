const parts = [
  // IPv4 loopback (127.0.0.0/8)
  '127\\.(?:\\d{1,3}\\.){2}\\d{1,3}',
  // IPv4 link-local (169.254.0.0/16)
  '169\\.254\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 Carrier-grade NAT (100.64.0.0/10)
  '100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (10.0.0.0/8)
  '10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (192.168.0.0/16)
  '192\\.168\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 private (172.16.0.0/12)
  '172\\.(?:1[6-9]|2\\d|3[0-1])\\.\\d{1,3}\\.\\d{1,3}',
  // IPv4 & IPv6 loopback
  '::1',
  '::',
  '0.0.0.0',
  // IPv6 Unique Local Address (fc00::/7)
  'f[cd][0-9a-f]{2}:[0-9a-f:]+',
  // IPv6 link-local (fe80::/10)
  'fe[89ab][0-9a-f]{2}:[0-9a-f:]+'
]

export const regExpPrivateIP = new RegExp(`^(?:${parts.join('|')})$`, 'i')
