import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ProgramGoal, ProgramLevel } from '@prisma/client';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { CreateProgramDto } from './dtos/create-program.dto';
import { PutDayContentDto } from './dtos/day-content.dto';
import {
  CreateProgramBlockDto,
  UpdateProgramBlockDto,
  UpdateProgramWeekDto,
} from './dtos/program-block.dto';
import {
  CreateProgramDayDto,
  ImportDayFromTemplateDto,
  UpdateProgramDayDto,
} from './dtos/program-day.dto';
import { UpdateProgramDto } from './dtos/update-program.dto';
import { EnrollmentService } from './enrollment.service';
import {
  ProgramManagementService,
  type ProgramScope,
} from './program-management.service';
import { ProgramStructureService } from './program-structure.service';

const PROGRAM_SCOPES: ProgramScope[] = ['system', 'mine'];

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly programManagement: ProgramManagementService,
    private readonly programStructure: ProgramStructureService,
    private readonly enrollment: EnrollmentService,
  ) {}

  /**
   * List curated programs (scope=system, default) or the user's own programs
   * (scope=mine), filterable by goal, level and days per week
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get()
  listPrograms(
    @CurrentUser() user: AuthUser,
    @Query('scope', new ParseEnumPipe(PROGRAM_SCOPES, { optional: true }))
    scope?: ProgramScope,
    @Query('goal', new ParseEnumPipe(ProgramGoal, { optional: true }))
    goal?: ProgramGoal,
    @Query('level', new ParseEnumPipe(ProgramLevel, { optional: true }))
    level?: ProgramLevel,
    @Query('daysPerWeek', new ParseIntPipe({ optional: true }))
    daysPerWeek?: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.programManagement.listPrograms(user.id, {
      scope: scope ?? 'system',
      goal,
      level,
      daysPerWeek,
      cursor,
    });
  }

  /**
   * Create a private program (starts with one block of one week)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Post('')
  createProgram(@CurrentUser() user: AuthUser, @Body() body: CreateProgramDto) {
    return this.programManagement.createProgram(user.id, body);
  }

  /**
   * Get a program with its full tree (own or curated)
   * @throws {401} Unauthorized.
   * @throws {403} Program not found.
   */
  @Get(':programId')
  getProgram(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.programManagement.getProgram(user.id, programId);
  }

  /**
   * Suggested starting values (from history and records) for enrolling
   * @throws {401} Unauthorized.
   * @throws {403} Program not found.
   */
  @Get(':programId/enroll-defaults')
  getProgramEnrollDefaults(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.enrollment.getEnrollDefaults(user.id, programId);
  }

  /**
   * Update a program's metadata
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Program not found.
   */
  @Patch(':programId')
  updateProgram(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Body() body: UpdateProgramDto,
  ) {
    return this.programManagement.updateProgram(user.id, programId, body);
  }

  /**
   * Delete a private program (enrollments keep their snapshot)
   * @throws {401} Unauthorized.
   * @throws {403} Program not found.
   */
  @Delete(':programId')
  deleteProgram(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.programManagement.deleteProgram(user.id, programId);
  }

  /**
   * Copy a program (curated included) into the user's own programs
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Program not found.
   */
  @Post(':programId/duplicate')
  duplicateProgram(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.programManagement.duplicateProgram(user.id, programId);
  }

  /**
   * Add a block of weeks to a program
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Program not found.
   */
  @Post(':programId/blocks')
  createProgramBlock(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Body() body: CreateProgramBlockDto,
  ) {
    return this.programStructure.createBlock(user.id, programId, body);
  }

  /**
   * Update a block (name, focus, number of weeks, order)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Block not found.
   */
  @Patch(':programId/blocks/:blockId')
  updateProgramBlock(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('blockId', ParseIntPipe) blockId: number,
    @Body() body: UpdateProgramBlockDto,
  ) {
    return this.programStructure.updateBlock(user.id, programId, blockId, body);
  }

  /**
   * Delete a block
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Block not found.
   */
  @Delete(':programId/blocks/:blockId')
  deleteProgramBlock(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('blockId', ParseIntPipe) blockId: number,
  ) {
    return this.programStructure.deleteBlock(user.id, programId, blockId);
  }

  /**
   * Duplicate a block with its weeks, days, exercises and sets
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Block not found.
   */
  @Post(':programId/blocks/:blockId/duplicate')
  duplicateProgramBlock(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('blockId', ParseIntPipe) blockId: number,
  ) {
    return this.programStructure.duplicateBlock(user.id, programId, blockId);
  }

  /**
   * Update a week's label, deload flag and multipliers
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Week not found.
   */
  @Patch(':programId/blocks/:blockId/weeks/:weekInBlock')
  updateProgramWeek(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('blockId', ParseIntPipe) blockId: number,
    @Param('weekInBlock', ParseIntPipe) weekInBlock: number,
    @Body() body: UpdateProgramWeekDto,
  ) {
    return this.programStructure.updateWeek(
      user.id,
      programId,
      blockId,
      weekInBlock,
      body,
    );
  }

  /**
   * Add a day to a block
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Block not found.
   */
  @Post(':programId/blocks/:blockId/days')
  createProgramDay(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('blockId', ParseIntPipe) blockId: number,
    @Body() body: CreateProgramDayDto,
  ) {
    return this.programStructure.createDay(user.id, programId, blockId, body);
  }

  /**
   * Update a day's name, weekday, notes or order
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Day not found.
   */
  @Patch(':programId/days/:dayId')
  updateProgramDay(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('dayId', ParseIntPipe) dayId: number,
    @Body() body: UpdateProgramDayDto,
  ) {
    return this.programStructure.updateDay(user.id, programId, dayId, body);
  }

  /**
   * Delete a day
   * @throws {401} Unauthorized.
   * @throws {403} Day not found.
   */
  @Delete(':programId/days/:dayId')
  deleteProgramDay(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('dayId', ParseIntPipe) dayId: number,
  ) {
    return this.programStructure.deleteDay(user.id, programId, dayId);
  }

  /**
   * Replace all exercises and sets of a day
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Day not found.
   * @throws {404} Exercise not found.
   */
  @Put(':programId/days/:dayId/content')
  putProgramDayContent(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('dayId', ParseIntPipe) dayId: number,
    @Body() body: PutDayContentDto,
  ) {
    return this.programStructure.putDayContent(user.id, programId, dayId, body);
  }

  /**
   * Append a workout template's exercises to a day
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Day or template not found.
   */
  @Post(':programId/days/:dayId/import-template')
  importTemplateIntoProgramDay(
    @CurrentUser() user: AuthUser,
    @Param('programId', ParseIntPipe) programId: number,
    @Param('dayId', ParseIntPipe) dayId: number,
    @Body() body: ImportDayFromTemplateDto,
  ) {
    return this.programStructure.importDayFromTemplate(
      user.id,
      programId,
      dayId,
      body,
    );
  }
}
