import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { RoleCode } from '../common/constants';
import {
  CreateCategoryDto,
  CreateCollegeDto,
  CreateSystemUserDto,
  UpdateCategoryDto,
  UpdateCollegeDto,
} from './dto/system.dto';

@ApiTags('system')
@ApiBearerAuth()
@Controller('system')
@Roles(RoleCode.SCHOOL_ADMIN)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('colleges')
  listColleges(@CurrentUser() user: AuthUser) {
    return this.system.listColleges(user);
  }

  @Post('colleges')
  createCollege(@CurrentUser() user: AuthUser, @Body() dto: CreateCollegeDto) {
    return this.system.createCollege(user, dto);
  }

  @Patch('colleges/:id')
  updateCollege(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCollegeDto,
  ) {
    return this.system.updateCollege(user, id, dto);
  }

  @Delete('colleges/:id')
  deleteCollege(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.system.deleteCollege(user, id);
  }

  @Get('categories')
  listCategories(
    @CurrentUser() user: AuthUser,
    @Query('meetingType') meetingType?: string,
    @Query('scope') scope?: 'school' | 'college' | 'all',
  ) {
    return this.system.listCategories(user, meetingType, scope || 'all');
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.system.createCategory(user, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.system.updateCategory(user, id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.system.deleteCategory(user, id);
  }

  @Post('users')
  createUser(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSystemUserDto,
  ) {
    return this.system.createUser(user, dto);
  }
}
