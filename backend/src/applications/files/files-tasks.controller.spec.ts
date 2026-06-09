import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/cache.service'
import { FilesTasksController } from './files-tasks.controller'
import { FilesMethods } from './services/files-methods.service'
import { FilesTasksManager } from './services/tasks/files-tasks-manager.service'
import { Mock } from 'vitest'

describe(FilesTasksController.name, () => {
  let controller: FilesTasksController
  let filesTasksManager: { getTasks: Mock; pollTasks: Mock; deleteTasks: Mock; downloadArchive: Mock }

  beforeAll(async () => {
    filesTasksManager = {
      getTasks: vi.fn(),
      pollTasks: vi.fn(),
      deleteTasks: vi.fn(),
      downloadArchive: vi.fn()
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
    vi.clearAllMocks()
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

  it('pollTasks should delegate tracked task ids to FilesTasksManager', () => {
    const user = { id: 'user-3' } as any
    const dto = { trackedIds: ['task-a', 'task-b'] }
    const expected = { active: [], ended: [], missingIds: ['task-a', 'task-b'] }

    filesTasksManager.pollTasks.mockReturnValueOnce(expected)

    const result = controller.pollTasks(user, dto)

    expect(filesTasksManager.pollTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.pollTasks).toHaveBeenCalledWith('user-3', dto.trackedIds)
    expect(result).toBe(expected)
  })

  it('deleteTasks should delegate deletion of all tasks', () => {
    const user = { id: 'user-5' } as any
    const expected = { deletedAll: true }

    filesTasksManager.deleteTasks.mockReturnValueOnce(expected)

    const result = controller.deleteTasks(user)

    expect(filesTasksManager.deleteTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.deleteTasks).toHaveBeenCalledWith(user)
    expect(result).toBe(expected)
  })

  it('deleteSelectedTasks should delegate task ids to FilesTasksManager', () => {
    const user = { id: 'user-6' } as any
    const dto = { taskIds: ['task-a', 'task-b'] }
    const expected = { deleted: true }

    filesTasksManager.deleteTasks.mockReturnValueOnce(expected)

    const result = controller.deleteSelectedTasks(user, dto)

    expect(filesTasksManager.deleteTasks).toHaveBeenCalledTimes(1)
    expect(filesTasksManager.deleteTasks).toHaveBeenCalledWith(user, dto.taskIds)
    expect(result).toBe(expected)
  })

  it('downloadTaskFile should delegate to FilesTasksManager.downloadArchive and return the StreamableFile', async () => {
    const user = { id: 'user-7' } as any
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
