import { FastifyReply } from 'fastify'
import { FastifyDAVRequest } from '../interfaces/webdav.interface'

export function IfHeaderDecorator() {
  return (_target: any, _key?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => {
    const originalMethod = descriptor.value
    descriptor.value = async function (...args: any[]) {
      const req: FastifyDAVRequest = args[0]
      const res: FastifyReply = args[1]
      if (!(await this.evaluateIfHeaders(req, res))) {
        // if there is an error the response is generated inside the `evaluateIfHeaders` function
        return
      }
      return await originalMethod.apply(this, args)
    }
  }
}
