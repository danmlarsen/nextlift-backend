import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { UserProfileService } from './user-profile.service';
import { UpsertUserProfileDto } from './dtos/upsert-user-profile.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.userProfileService.findProfile(user.id);
  }

  @Put()
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: UpsertUserProfileDto,
  ) {
    return this.userProfileService.upsertProfile(user.id, body);
  }
}
