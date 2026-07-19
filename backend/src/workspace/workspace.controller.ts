import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';

@ApiTags('workspace')
@ApiBearerAuth()
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('todos')
  todos(@CurrentUser() user: AuthUser) {
    return this.workspace.getTodos(user);
  }

  @Get('flow-board')
  flowBoard(@CurrentUser() user: AuthUser) {
    return this.workspace.getFlowBoard(user);
  }
}
