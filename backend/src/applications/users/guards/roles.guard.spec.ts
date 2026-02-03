import { createMock, DeepMocked } from '@golevelup/ts-jest'
import { ExecutionContext, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { USER_ROLE } from '../constants/user'
import { UserHaveRole } from '../decorators/roles.decorator'
import { UserModel } from '../models/user.model'
import { generateUserTest } from '../utils/test'
import { UserRolesGuard } from './roles.guard'

describe(UserRolesGuard.name, () => {
  let reflector: Reflector
  let rolesGuard: UserRolesGuard
  let userTest: UserModel
  let context: DeepMocked<ExecutionContext>

  beforeAll(async () => {
    reflector = new Reflector()
    rolesGuard = new UserRolesGuard(reflector)
    userTest = new UserModel(generateUserTest())
    Logger.overrideLogger(['fatal'])
  })

  it('should be defined', () => {
    expect(reflector).toBeDefined()
    expect(rolesGuard).toBeDefined()
    expect(userTest).toBeDefined()
  })

  it('should pass with a valid role', async () => {
    userTest.role = USER_ROLE.GUEST
    context = createMock<ExecutionContext>()
    UserHaveRole(USER_ROLE.GUEST)(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBe(true)
  })

  it('should pass with a higher user role', async () => {
    userTest.role = USER_ROLE.USER
    context = createMock<ExecutionContext>()
    UserHaveRole(USER_ROLE.GUEST)(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBe(true)
  })

  it('should not pass with a lower role', async () => {
    userTest.role = USER_ROLE.GUEST
    context = createMock<ExecutionContext>()
    UserHaveRole(USER_ROLE.USER)(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBeFalsy()
  })

  it('should not pass with an undefined user role', async () => {
    userTest.role = undefined
    context = createMock<ExecutionContext>()
    UserHaveRole(USER_ROLE.USER)(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBeFalsy()
  })

  it('should not pass with a missing decorator', async () => {
    userTest.role = USER_ROLE.USER
    context = createMock<ExecutionContext>()
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBeFalsy()
  })

  it('should pass with an empty decorator', async () => {
    userTest.role = USER_ROLE.USER
    context = createMock<ExecutionContext>()
    UserHaveRole()(context.getHandler())
    context.switchToHttp().getRequest.mockReturnValue({
      user: userTest
    })
    expect(rolesGuard.canActivate(context)).toBeTruthy()
  })
})
