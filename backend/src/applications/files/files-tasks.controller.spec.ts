import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { FilesTasksController } from './files-tasks.controller'
import { FilesMethods } from './services/files-methods.service'
import { FilesTasksManager } from './services/files-tasks-manager.service'

describe(FilesTasksController.name, () => {
  let controller: FilesTasksController
  let filesTasksManager: { getTasks: jest.Mock; deleteTasks: jest.Mock; downloadArchive: jest.Mock }

  beforeAll(async () => {
    filesTasksManager = {
      getTasks: jest.fn(),
      deleteTasks: jest.fn(),
      downloadArchive: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesTasksController],
      providers: [
        {
          provide: Cache,
          useValue: {}
        },
        { provide: FilesMethods, useValue: {} },
        { provide: FilesTasksManager, useValue: filesTasksManager }
      ]
    }).compile()

    controller = module.get<FilesTasksController>(FilesTasksController)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('getTasks should call FilesTasksManager.getTasks with user.id and taskId and return the value', () => {
    const user = { id: 'user-1' } as any
    const taskId = 'task-123'
    const expected = [{ id: 'task-123' }]

    filesTasksManager.getTasks.mockReturnValueOnce(expected)

    const result = controller.getTasks(user, taskId)

    expect(filesTasksManager.getTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.getTasks).toHaveBeenCalledWith('user-1', 'task-123')
    expect(result).toBe(expected)
  })

  it('getTasks without taskId should pass undefined', () => {
    const user = { id: 'user-2' } as any
    const expected = [{ id: 'task-a' }, { id: 'task-b' }]

    filesTasksManager.getTasks.mockReturnValueOnce(expected)

    const result = controller.getTasks(user)

    expect(filesTasksManager.getTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.getTasks).toHaveBeenCalledWith('user-2', undefined)
    expect(result).toBe(expected)
  })

  it('deleteTasks should call FilesTasksManager.deleteTasks with user and taskId and return the value', () => {
    const user = { id: 'user-3', name: 'Alice' } as any
    const taskId = 'task-del-1'
    const expected = { deleted: true }

    filesTasksManager.deleteTasks.mockReturnValueOnce(expected)

    const result = controller.deleteTasks(user, taskId)

    expect(filesTasksManager.deleteTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.deleteTasks).toHaveBeenCalledWith(user, 'task-del-1')
    expect(result).toBe(expected)
  })

  it('deleteTasks without taskId must pass undefined', () => {
    const user = { id: 'user-4' } as any
    const expected = { deletedAll: true }

    filesTasksManager.deleteTasks.mockReturnValueOnce(expected)

    const result = controller.deleteTasks(user)

    expect(filesTasksManager.deleteTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.deleteTasks).toHaveBeenCalledWith(user, undefined)
    expect(result).toBe(expected)
  })

  it('downloadTaskFile should delegate to FilesTasksManager.downloadArchive and return the StreamableFile', async () => {
    const user = { id: 'user-5' } as any
    const taskId = 'task-dl-42'
    const req = {} as any
    const res = {} as any
    const streamable = { some: 'stream' } as any

    filesTasksManager.downloadArchive.mockResolvedValueOnce(streamable)

    const result = await controller.downloadTaskFile(user, taskId, req, res)

    expect(filesTasksManager.downloadArchive).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.downloadArchive).toHaveBeenCalledWith(user, 'task-dl-42', req, res)
    expect(result).toBe(streamable)
  })
})
