import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { appBootstrap } from './app.bootstrap'

describe('AppStaticFiles (e2e)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(app).toBeDefined()
  })

  it('GET / => 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    })
    expect(res.statusCode).toEqual(200)
  })
})
