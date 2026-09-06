import { Controller, Get, UseGuards } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import { AUTH_RATE_LIMIT_ERROR_MESSAGE, AUTH_RATE_LIMIT_OPTIONS } from '../constants/auth'
import { AuthRateLimitGuard } from './auth-rate-limit.guard'

@Controller('rate-limit-test')
class RateLimitTestController {
  @Get()
  @UseGuards(AuthRateLimitGuard)
  handle(): boolean {
    return true
  }
}

describe(AuthRateLimitGuard.name, () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([AUTH_RATE_LIMIT_OPTIONS])],
      controllers: [RateLimitTestController],
      providers: [AuthRateLimitGuard]
    }).compile()

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => app.close())

  it('should block requests over the limit and expose the retry delay', async () => {
    for (let request = 0; request < AUTH_RATE_LIMIT_OPTIONS.limit; request++) {
      const response = await app.inject({ method: 'GET', url: '/rate-limit-test' })
      expect(response.statusCode).toBe(200)
    }

    const response = await app.inject({ method: 'GET', url: '/rate-limit-test' })

    expect(response.statusCode).toBe(429)
    expect(response.headers['retry-after']).toBe(String(AUTH_RATE_LIMIT_OPTIONS.blockDuration / 1000))
    expect(response.json().message).toBe(AUTH_RATE_LIMIT_ERROR_MESSAGE)
  })
})
