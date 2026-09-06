import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';
import crypto from 'crypto';
import { Exercise, Prisma, UserType } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { FULL_PROGRAM_INCLUDE } from 'src/programs/const/full-program-include';
import {
  collectSlots,
  initialStateForSlot,
} from 'src/programs/engine/enrollment-defaults';
import { totalWeeks } from 'src/programs/engine/schedule';
import { toSnapshot } from 'src/programs/utils/program-snapshot';

// Curated program (prisma/data/programs) demo accounts follow from the start.
const DEMO_PROGRAM_SLUG = 'full-body-linear-3-day';
// Plausible starting weights per progression key of that program.
const DEMO_START_WEIGHTS: Record<string, number> = {
  squat: 60,
  bench: 40,
  row: 40,
  ohp: 30,
  deadlift: 80,
};

@Injectable()
export class DemoService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
    private readonly personalRecordsService: PersonalRecordsService,
    @InjectPinoLogger(DemoService.name) private readonly logger: PinoLogger,
  ) {}

  async createDemoSession(captchaToken: string, ipAddress: string) {
    this.logger.info(`Creating demo session`, { ipAddress });
    await this.authService.verifyCaptcha(captchaToken);

    await this.checkIpRateLimit(ipAddress);

    // A suspended Fly machine cannot run the scheduled 03:00 cleanup. Running
    // it when demo traffic wakes the app keeps expiry reliable on the free tier.
    await this.cleanupExpiredDemoUsers();

    const demoUser = await this.createDemoUser();

    this.logger.info(`Demo user created`, { userId: demoUser.id, ipAddress });
    return this.authService.login(demoUser);
  }

  // Cleanup job to remove expired demo users
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredDemoUsers() {
    try {
      this.logger.info('Starting cleanup of expired demo users');
      const whereClause = {
        userType: UserType.DEMO,
        demoExpiresAt: { lt: new Date() },
      };

      const usersToDelete = await this.prismaService.user.findMany({
        where: whereClause,
      });

      if (usersToDelete.length > 0) {
        await this.prismaService.$transaction(async (tx) => {
          await tx.deletedUser.createMany({
            data: usersToDelete.map((users) => ({
              originalUserId: users.id,
              email: users.email,
              createdAt: users.createdAt,
            })),
          });

          return tx.user.deleteMany({
            where: whereClause,
          });
        });
      }
      this.logger.info('Completed cleanup of expired demo users', {
        deletedCount: usersToDelete.length,
      });
    } catch (error: unknown) {
      // Cleanup must never prevent a user from starting a demo session.
      this.logger.error('Failed to clean up expired demo users', { error });
    }
  }

  private async createDemoUser() {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');

    const demoUser = await this.prismaService.user.create({
      data: {
        email: `demo-${timestamp}-${randomSuffix}@nextlift.invalid`,
        password: 'demo-password-not-used',
        isEmailConfirmed: true,
        isActive: true,
        userType: 'DEMO',
        demoExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      },
    });

    await this.seedDemoData(demoUser.id);

    return demoUser;
  }

  private async seedDemoData(userId: number) {
    this.logger.info(`Seeding demo data for user`, { userId });
    const exercises = await this.prismaService.exercise.findMany({
      where: { userId: -1 },
      orderBy: { name: 'asc' },
    });

    if (exercises.length === 0) {
      this.logger.warn('No system exercises found for demo data seeding');
      return;
    }

    const workoutDates = this.generateRandomWorkoutDates(10);

    // Create workouts for each date
    const workouts: { id: number; startedAt: Date }[] = [];
    for (let i = 0; i < workoutDates.length; i++) {
      const workoutDate = workoutDates[i];
      const workout = await this.createDemoWorkout(
        userId,
        exercises,
        workoutDate,
        i,
      );
      workouts.push({ id: workout.id, startedAt: workout.startedAt });
    }

    // Enrolling the demo user shows the program feature straight away; it
    // must never block the demo session, so failures are only logged.
    try {
      await this.enrollDemoUser(userId, workouts);
    } catch (error: unknown) {
      this.logger.error(`Failed to enroll demo user in a program`, {
        userId,
        error,
      });
    }

    // The seeded workouts bypass the write hooks, so derive the records here;
    // otherwise the demo user's first real set falsely celebrates.
    try {
      await this.personalRecordsService.recomputeAllForUser(userId);
    } catch (error: unknown) {
      this.logger.error(`Failed to compute personal records for demo user`, {
        userId,
        error,
      });
    }
  }

  /**
   * Enrolls the demo user in the beginner full-body program with the two most
   * recent seeded workouts recorded as its first two days, so the dashboard
   * shows a next program workout immediately.
   */
  private async enrollDemoUser(
    userId: number,
    workouts: { id: number; startedAt: Date }[],
  ) {
    const program = await this.prismaService.program.findFirst({
      where: { userId: -1, slug: DEMO_PROGRAM_SLUG },
      include: FULL_PROGRAM_INCLUDE,
    });
    if (!program) {
      this.logger.warn(`Demo program not seeded`, { slug: DEMO_PROGRAM_SLUG });
      return;
    }
    const snapshot = toSnapshot(program);
    const states = collectSlots(snapshot).map((slot) =>
      initialStateForSlot(slot, {
        workingWeight: DEMO_START_WEIGHTS[slot.progressionKey] ?? null,
      }),
    );
    const days = snapshot.blocks[0]?.days ?? [];
    const recent = [...workouts]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, Math.min(2, days.length))
      .reverse();
    const startDate = new Date(
      recent[0]?.startedAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );
    startDate.setUTCHours(0, 0, 0, 0);

    await this.prismaService.$transaction(async (tx) => {
      const enrollment = await tx.programEnrollment.create({
        data: {
          userId,
          programId: program.id,
          programVersion: program.version,
          programName: program.name,
          totalWeeks: totalWeeks(snapshot),
          snapshot: snapshot,
          startDate,
          // Both days of the rotation are done: the next workout starts cycle 2.
          currentCycle: recent.length === days.length ? 2 : 1,
          currentWeekIndex: 1,
          currentDayIndex:
            recent.length === days.length ? 1 : recent.length + 1,
          states: {
            create: states.map((state) => ({
              progressionKey: state.progressionKey,
              exerciseId: state.exerciseId,
              originalExerciseId: state.exerciseId,
              workingWeight: state.workingWeight,
              trainingMax: state.trainingMax,
              e1rm: state.e1rm,
              roundingKg: state.roundingKg,
            })),
          },
        },
      });
      for (const [index, workout] of recent.entries()) {
        const day = days[index];
        const log = await tx.programEnrollmentDayLog.create({
          data: {
            enrollmentId: enrollment.id,
            cycle: 1,
            weekIndex: 1,
            dayIndex: index + 1,
            programDayId: day.id,
            dayName: day.name,
            status: 'COMPLETED',
            startedAt: workout.startedAt,
            completedAt: workout.startedAt,
          },
        });
        await tx.workout.update({
          where: { id: workout.id },
          data: {
            title: `${program.name} · ${day.name}`,
            programDayLogId: log.id,
          },
        });
      }
    });
  }

  private generateRandomWorkoutDates(count: number): Date[] {
    const now = new Date();
    const dates = new Set<string>(); // Use string dates to avoid duplicates
    const workoutDates: Date[] = [];

    while (dates.size < count) {
      // Random number of days between 20 and 0
      const daysOffset = Math.floor(Math.random() * -20);
      const workoutDate = new Date(now);
      workoutDate.setDate(workoutDate.getDate() + daysOffset);

      // Reset time to avoid same-day conflicts
      workoutDate.setHours(0, 0, 0, 0);

      const dateString = workoutDate.toISOString().split('T')[0];

      if (!dates.has(dateString)) {
        dates.add(dateString);

        // Set realistic workout time (6 AM to 9 PM)
        const workoutHour = 6 + Math.floor(Math.random() * 15);
        const workoutMinute = Math.floor(Math.random() * 60);
        workoutDate.setHours(workoutHour, workoutMinute);

        workoutDates.push(new Date(workoutDate));
      }
    }

    // Sort by date (oldest first)
    return workoutDates.sort((a, b) => a.getTime() - b.getTime());
  }

  private async createDemoWorkout(
    userId: number,
    exercises: Exercise[],
    workoutDate: Date,
    index: number,
  ) {
    // Use transaction to batch all workout-related operations
    return this.prismaService.$transaction(async (prisma) => {
      // Workout duration between 30-90 minutes
      const durationMinutes = 30 + Math.floor(Math.random() * 61);
      const completedAt = new Date(
        workoutDate.getTime() + durationMinutes * 60 * 1000,
      );

      const workoutTypes = [
        'Push Day',
        'Pull Day',
        'Leg Day',
        'Upper Body',
        'Full Body',
        'Cardio & Strength',
        'Back & Biceps',
        'Chest & Triceps',
        'Shoulders & Arms',
        'HIIT Session',
      ];

      const workoutTitle = workoutTypes[index % workoutTypes.length];
      const workoutNotes =
        Math.random() < 0.3 ? this.getRandomWorkoutNote() : null;

      // Create the workout
      const workout = await prisma.workout.create({
        data: {
          userId,
          title: workoutTitle,
          status: 'COMPLETED',
          startedAt: workoutDate,
          completedAt,
          activeDuration: durationMinutes * 60,
          notes: workoutNotes,
        },
      });

      // Select exercises for this workout
      const exerciseCount = 3 + Math.floor(Math.random() * 4);
      const selectedExercises = this.selectRandomExercises(
        exercises,
        exerciseCount,
      );

      // Prepare all workout exercises data
      const workoutExercisesData = selectedExercises.map((exercise, j) => ({
        workoutId: workout.id,
        exerciseId: exercise.id,
        exerciseOrder: j + 1,
        notes: Math.random() < 0.2 ? this.getRandomExerciseNote() : null,
      }));

      // Create all workout exercises in batch
      await prisma.workoutExercise.createMany({
        data: workoutExercisesData,
      });

      // Get the created workout exercises with their IDs
      const createdWorkoutExercises = await prisma.workoutExercise.findMany({
        where: { workoutId: workout.id },
        orderBy: { exerciseOrder: 'asc' },
      });

      // Generate all sets data for all exercises in this workout
      const allSetsData: Prisma.WorkoutSetCreateManyInput[] = [];

      for (let j = 0; j < createdWorkoutExercises.length; j++) {
        const workoutExercise = createdWorkoutExercises[j];
        const exercise = selectedExercises[j];

        const setsForThisExercise = this.generateDemoSetsData(
          workoutExercise.id,
          exercise,
        );

        allSetsData.push(...setsForThisExercise);
      }

      // Create all sets in one batch operation
      if (allSetsData.length > 0) {
        await prisma.workoutSet.createMany({
          data: allSetsData,
        });
      }

      return workout;
    });
  }

  private selectRandomExercises(
    allExercises: Exercise[],
    count: number,
  ): Exercise[] {
    const shuffled = [...allExercises].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, allExercises.length));
  }

  private generateRealisticWeight() {
    const allowedIncrements = [2.5, 5, 10, 15, 20, 25];
    const minWeight = 20;
    const maxWeight = 120;
    const possibleWeights: number[] = [];

    for (const inc of allowedIncrements) {
      for (let w = minWeight; w <= maxWeight; w += inc) {
        if (!possibleWeights.includes(w)) {
          possibleWeights.push(w);
        }
      }
    }

    possibleWeights.sort((a, b) => a - b);

    // Skew toward lower weights
    const r = Math.pow(Math.random(), 2);
    const idx = Math.floor(r * possibleWeights.length);
    return possibleWeights[idx];
  }

  private generateDemoSetsData(workoutExerciseId: number, exercise: Exercise) {
    const numSets = 3 + Math.floor(Math.random() * 3); // 3-5 sets
    const setsData: Prisma.WorkoutSetCreateManyInput[] = [];

    for (let setNum = 1; setNum <= numSets; setNum++) {
      const isWarmup = setNum === 1 && Math.random() < 0.4; // 40% chance first set is warmup

      let reps: null | number = null;
      let weight: null | number = null;
      let duration: null | number = null;

      if (exercise.category === 'strength') {
        if (isWarmup) {
          reps = 8 + Math.floor(Math.random() * 5); // 8-12 reps for warmup
          weight = 20;
        } else {
          reps = 6 + Math.floor(Math.random() * 8); // 6-13 reps
          weight = this.generateRealisticWeight();
        }
      } else if (exercise.category === 'cardio') {
        duration = 2 + Math.floor(Math.random() * 9); // 2-10 minutes
      }

      setsData.push({
        workoutExerciseId,
        setNumber: setNum,
        completed: true,
        reps,
        weight,
        duration,
        type: isWarmup ? 'warmup' : 'normal',
        notes: Math.random() < 0.1 ? 'Felt great!' : null, // 10% chance of set notes
      });
    }

    return setsData;
  }

  private async checkIpRateLimit(ipAddress: string) {
    this.logger.info(`Checking IP rate limit`, { ipAddress });
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Create a simple IP tracking record
    await this.prismaService.demoIpTracking.create({
      data: {
        ipAddress,
        createdAt: now,
      },
    });

    // Check daily limit (10 demo sessions per day per IP)
    const dailyCount = await this.prismaService.demoIpTracking.count({
      where: {
        ipAddress,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (dailyCount > 10) {
      this.logger.warn(`Daily demo limit reached for IP`, {
        ipAddress,
        dailyCount,
      });
      throw new BadRequestException(
        'Daily demo limit reached for this IP address',
      );
    }

    // Check hourly limit (3 demo sessions per hour per IP)
    const hourlyCount = await this.prismaService.demoIpTracking.count({
      where: {
        ipAddress,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (hourlyCount > 3) {
      this.logger.warn(`Hourly demo limit reached for IP`, {
        ipAddress,
        hourlyCount,
      });
      throw new BadRequestException(
        'Hourly demo limit reached. Please try again later.',
      );
    }

    // Cleanup old tracking records (older than 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    await this.prismaService.demoIpTracking.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
      },
    });
  }

  private getRandomWorkoutNote(): string {
    const notes = [
      'Great session today! Felt strong.',
      'Tough workout but pushed through.',
      'New PR on several exercises!',
      'Felt a bit tired but good overall.',
      'Really focused on form today.',
      'Challenging but rewarding session.',
      'Energy was high, great workout!',
      'Struggled a bit but finished strong.',
    ];
    return notes[Math.floor(Math.random() * notes.length)];
  }

  private getRandomExerciseNote(): string {
    const notes = [
      'Perfect form today',
      'Increased weight from last time',
      'Felt the burn!',
      'Good mind-muscle connection',
      'Full range of motion',
      'Controlled tempo',
    ];
    return notes[Math.floor(Math.random() * notes.length)];
  }
}
