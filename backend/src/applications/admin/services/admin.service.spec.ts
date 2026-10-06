import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../../infrastructure/cache/cache.service.js'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service.js'
import { AdminUsersQueries } from '../../users/services/admin-users-queries.service.js'
import { AdminService } from './admin.service.js'

describe(AdminService.name, () => {
  let service: AdminService

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: HttpService, useValue: {} },
        { provide: Cache, useValue: {} },
        { provide: AdminUsersQueries, useValue: {} },
        { provide: NotificationsManager, useValue: {} }
      ]
    }).compile()

    service = module.get<AdminService>(AdminService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
