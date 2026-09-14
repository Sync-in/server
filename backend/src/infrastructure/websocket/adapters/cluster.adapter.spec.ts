import { IoAdapter } from '@nestjs/platform-socket.io'
import { ClusterAdapter } from './cluster.adapter'

describe(ClusterAdapter.name, () => {
  afterEach(() => vi.restoreAllMocks())

  it('should allow NestJS to close the Socket.IO server', async () => {
    const close = vi.fn((callback: () => void) => callback())
    const server = { adapter: vi.fn(), close }
    vi.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue(server)
    const clusterAdapter = new ClusterAdapter()

    const ioServer = clusterAdapter.createIOServer(0)

    expect(ioServer.close).toBe(close)
    expect(server.adapter).toHaveBeenCalledOnce()
    await expect(clusterAdapter.close(ioServer)).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })
})
