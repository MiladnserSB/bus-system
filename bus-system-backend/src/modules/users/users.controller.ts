import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import {
  CreateUserDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة المستخدمين والموظفين (للمدير فقط)' })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء حساب موظف استقبال بكلمة مرور مؤقتة (للمدير فقط)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() admin: AuthUser) {
    return this.usersService.create(dto, admin.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'بيانات مستخدم محدد (للمدير فقط)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تعديل بيانات موظف (للمدير فقط)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.update(id, dto, admin.id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'تفعيل أو تعطيل حساب موظف مع إنهاء جلساته فوراً (للمدير فقط)',
  })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.updateStatus(id, dto, admin.id);
  }

  @Post(':id/reset-password')
  @ApiOperation({
    summary: 'إعادة تعيين كلمة مرور موظف وإجباره على التغيير عند أول دخول',
  })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.usersService.resetPassword(id, dto, admin.id);
  }
}
