import { FastifyReply } from 'fastify'
import { FastifyDAVRequest } from '../interfaces/webdav.interface.js'

export function IfHeaderDecorator() {
  return (_target: object, _key: string | symbol, descriptor: PropertyDescriptor): void => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown
    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const req = args[0] as FastifyDAVRequest
      const res = args[1] as FastifyReply
      if (!(await (this as { evaluateIfHeaders(req: FastifyDAVRequest, res: FastifyReply): Promise<boolean> }).evaluateIfHeaders(req, res))) {
        // if there is an error the response is generated inside the `evaluateIfHeaders` function
        return
      }
      return await originalMethod.apply(this, args)
    }
  }
}
