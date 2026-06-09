import { Body, Controller, Delete, Get, Param, Post, Req, Res, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { FastifySpaceRequest } from '../spaces/interfaces/space-request.interface'
import { GetUser } from '../users/decorators/user.decorator'
import { UserModel } from '../users/models/user.model'
import { API_FILES_TASKS, FILES_ROUTE } from './constants/routes'
import type { FileTasksPollResponse } from './interfaces/file-task.interface'
import { FilesTasksManager } from './services/tasks/files-tasks-manager.service'
import { FileTasksDeleteDto, FileTasksPollDto } from './dto/file-tasks.dto'

@Controller(API_FILES_TASKS)
export class FilesTasksController {
  constructor(private readonly filesTasksManager: FilesTasksManager) {}

  @Get(':id?')
  getTasks(@GetUser() user: UserModel, @Param('id') taskId?: string) {
    return this.filesTasksManager.getTasks(user.id, taskId)
  }

  @Post(FILES_ROUTE.TASKS_POLL)
  pollTasks(@GetUser() user: UserModel, @Body() fileTasksPollDto: FileTasksPollDto): Promise<FileTasksPollResponse> {
    return this.filesTasksManager.pollTasks(user.id, fileTasksPollDto.trackedIds)
  }

  @Delete()
  deleteTasks(@GetUser() user: UserModel) {
    return this.filesTasksManager.deleteTasks(user)
  }

  @Post(FILES_ROUTE.TASKS_DELETE)
  deleteSelectedTasks(@GetUser() user: UserModel, @Body() fileTasksDeleteDto: FileTasksDeleteDto) {
    return this.filesTasksManager.deleteTasks(user, fileTasksDeleteDto.taskIds)
  }

  @Post(`${FILES_ROUTE.TASKS_CANCEL}/:id`)
  cancelTask(@GetUser() user: UserModel, @Param('id') taskId: string) {
    return this.filesTasksManager.cancelTask(user.id, taskId)
  }

  @Get(`${FILES_ROUTE.TASKS_DOWNLOAD}/:id`)
  downloadTaskFile(
    @GetUser() user: UserModel,
    @Param('id') taskId: string,
    @Req() req: FastifySpaceRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<StreamableFile> {
    return this.filesTasksManager.downloadArchive(user, taskId, req, res)
  }
}
