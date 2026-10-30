import type { ArgumentsHost } from '@nestjs/common'
import { Body, Catch, Controller, Get, Header, HttpException, HttpStatus, Post, StreamableFile } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { FastifyReply } from 'fastify'
import { errorCodes } from 'fastify'
import { Readable } from 'node:stream'

@Catch()
class ExceptionKindProbeFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .header('x-exception-kind', exception instanceof HttpException ? 'http-exception' : 'raw-error')
    super.catch(exception, host)
  }
}

@Controller('http-adapter-test')
class HttpAdapterTestController {
  @Get('object-error')
  @Header('Content-Type', 'application/xml')
  objectError(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.CONFLICT,
        message: 'Resource locked',
        error: 'Conflict'
      },
      HttpStatus.CONFLICT
    )
  }

  @Post('body')
  body(@Body() body: unknown): unknown {
    return body
  }

  @Get('fastify-5xx')
  fastify5xx(): boolean {
    return true
  }

  @Get('failing-stream')
  failingStream(): StreamableFile {
    return new StreamableFile(
      new Readable({
        read() {
          this.destroy(new Error('stream failed'))
        }
      })
    )
  }
}

describe('Fastify HTTP adapter (e2e)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HttpAdapterTestController]
    }).compile()
    const adapter = new FastifyAdapter({ bodyLimit: 32 })

    adapter.getInstance().addHook('onRequest', (request, _reply, done) => {
      if (request.url === '/http-adapter-test/fastify-5xx') {
        done(new errorCodes.FST_ERR_MISSING_MIDDLEWARE())
        return
      }
      done()
    })

    app = module.createNestApplication<NestFastifyApplication>(adapter, { logger: false })
    app.useGlobalFilters(new ExceptionKindProbeFilter(app.getHttpAdapter()))
    await app.init()
    await adapter.getInstance().ready()
  })

  afterAll(async () => app.close())

  it('should force JSON for an object error even when the route declares another Content-Type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/http-adapter-test/object-error'
    })

    expect(response.statusCode).toBe(HttpStatus.CONFLICT)
    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.json()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      message: 'Resource locked',
      error: 'Conflict'
    })
  })

  it('should map a Fastify 4xx parser error to HttpException', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/http-adapter-test/body',
      headers: { 'content-type': 'application/json' },
      payload: { value: 'x'.repeat(64) }
    })

    expect(response.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE)
    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.headers['x-exception-kind']).toBe('http-exception')
    expect(response.json()).toEqual(
      expect.objectContaining({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: expect.any(String)
      })
    )
  })

  it('should keep a Fastify 5xx error unmapped for the built-in exception handling', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/http-adapter-test/fastify-5xx'
    })

    expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.headers['x-exception-kind']).toBe('raw-error')
    expect(response.json()).toEqual(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: expect.any(String)
      })
    )
  })

  it('should turn a stream failure before headers into a server error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/http-adapter-test/failing-stream'
    })

    expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.headers['x-exception-kind']).toBe('raw-error')
    const body = response.json()
    expect(body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error'
    })
    expect(JSON.stringify(body)).not.toContain('stream failed')
  })
})
