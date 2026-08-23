import { Test, TestingModule } from '@nestjs/testing';
import { RecordType } from '@prisma/client';
import { calculateOneRepMax } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import { PersonalRecordsService } from './personal-records.service';
import { EligibleSetInput } from './types/personal-record.types';

describe('PersonalRecordsService', () => {
  let service: PersonalRecordsService;

  const personalRecordFindMany = jest.fn();
  const personalRecordUpsert = jest.fn();
  const personalRecordDeleteMany = jest.fn();
  const workoutSetFindMany = jest.fn();
  const workoutExerciseFindMany = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    personalRecord: {
      findMany: personalRecordFindMany,
      upsert: personalRecordUpsert,
      deleteMany: personalRecordDeleteMany,
    },
    workoutSet: { findMany: workoutSetFindMany },
    workoutExercise: { findMany: workoutExerciseFindMany },
    $transaction: transaction,
  };

  const userId = 7;
  const exerciseId = 1;
  const startedAt = new Date('2026-08-01T10:00:00Z');

  const makeSet = (overrides: Partial<EligibleSetInput> = {}) => ({
    id: 10,
    completed: true,
    type: 'normal',
    weight: 100,
    reps: 5,
    duration: null,
    ...overrides,
  });

  const writeParams = (set: EligibleSetInput) => ({
    exerciseId,
    exerciseName: 'Bench Press',
    workoutStartedAt: startedAt,
    set,
  });

  const storedRecord = (
    recordType: RecordType,
    value: number,
    workoutSetId: number,
  ) => ({
    id: 100,
    userId,
    exerciseId,
    recordType,
    value,
    achievedAt: new Date('2026-07-01T10:00:00Z'),
    createdAt: new Date('2026-07-01T10:00:00Z'),
    workoutSetId,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    personalRecordUpsert.mockResolvedValue({});
    personalRecordDeleteMany.mockResolvedValue({ count: 0 });
    transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalRecordsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:PersonalRecordsService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PersonalRecordsService>(PersonalRecordsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleSetWrite', () => {
    it('creates all record types for a first-ever eligible set', async () => {
      personalRecordFindMany.mockResolvedValue([]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet()),
      );

      expect(personalRecordUpsert).toHaveBeenCalledTimes(3);
      expect(newRecords).toHaveLength(3);
      expect(newRecords.map((record) => record.recordType)).toEqual([
        RecordType.MAX_WEIGHT,
        RecordType.ONE_REP_MAX,
        RecordType.MAX_SET_VOLUME,
      ]);
      expect(newRecords.every((record) => record.previousValue === null)).toBe(
        true,
      );
      expect(newRecords[1].value).toBe(calculateOneRepMax(100, 5));
    });

    it('upserts and reports only strictly greater values', async () => {
      personalRecordFindMany.mockResolvedValue([
        storedRecord(RecordType.MAX_WEIGHT, 90, 5),
        storedRecord(RecordType.ONE_REP_MAX, 200, 5),
        storedRecord(RecordType.MAX_SET_VOLUME, 600, 5),
      ]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet()),
      );

      expect(newRecords).toHaveLength(1);
      expect(newRecords[0]).toMatchObject({
        recordType: RecordType.MAX_WEIGHT,
        value: 100,
        previousValue: 90,
        workoutSetId: 10,
        achievedAt: startedAt,
      });
      expect(personalRecordUpsert).toHaveBeenCalledTimes(1);
      expect(personalRecordUpsert).toHaveBeenCalledWith({
        where: {
          userId_exerciseId_recordType: {
            userId,
            exerciseId,
            recordType: RecordType.MAX_WEIGHT,
          },
        },
        create: {
          userId,
          exerciseId,
          recordType: RecordType.MAX_WEIGHT,
          value: 100,
          achievedAt: startedAt,
          workoutSetId: 10,
        },
        update: { value: 100, achievedAt: startedAt, workoutSetId: 10 },
      });
      // No holder was weakened, so no recompute.
      expect(workoutSetFindMany).not.toHaveBeenCalled();
    });

    it('keeps the earlier achievement on an exact tie', async () => {
      personalRecordFindMany.mockResolvedValue([
        storedRecord(RecordType.MAX_WEIGHT, 100, 5),
        storedRecord(RecordType.ONE_REP_MAX, calculateOneRepMax(100, 5), 5),
        storedRecord(RecordType.MAX_SET_VOLUME, 500, 5),
      ]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet()),
      );

      expect(newRecords).toHaveLength(0);
      expect(personalRecordUpsert).not.toHaveBeenCalled();
      expect(workoutSetFindMany).not.toHaveBeenCalled();
    });

    it('treats float noise from the stored value as a tie', async () => {
      // Stored doubles come back from Prisma rounded to ~16 digits, so a
      // re-saved identical set can differ from the stored value by ~1e-12.
      const noisyValue = calculateOneRepMax(100, 5) - 1e-12;
      personalRecordFindMany.mockResolvedValue([
        storedRecord(RecordType.MAX_WEIGHT, 100 - 1e-12, 10),
        storedRecord(RecordType.ONE_REP_MAX, noisyValue, 10),
        storedRecord(RecordType.MAX_SET_VOLUME, 500 + 1e-12, 10),
      ]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet()),
      );

      expect(newRecords).toHaveLength(0);
      expect(personalRecordUpsert).not.toHaveBeenCalled();
      // Also no recompute: the holder is within the tie band, not weakened.
      expect(workoutSetFindMany).not.toHaveBeenCalled();
    });

    it('recomputes without celebrating when the holder is edited downward', async () => {
      personalRecordFindMany.mockResolvedValue([
        storedRecord(RecordType.MAX_WEIGHT, 100, 10),
        storedRecord(RecordType.ONE_REP_MAX, calculateOneRepMax(100, 5), 10),
        storedRecord(RecordType.MAX_SET_VOLUME, 500, 10),
      ]);
      workoutSetFindMany.mockResolvedValue([]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet({ weight: 80 })),
      );

      expect(newRecords).toHaveLength(0);
      expect(personalRecordUpsert).not.toHaveBeenCalled();
      // Recompute ran for this exercise.
      expect(workoutSetFindMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['un-completed', { completed: false }],
      ['switched to warmup', { type: 'warmup' }],
    ])(
      'recomputes when the holder is %s',
      async (_label, overrides: Partial<EligibleSetInput>) => {
        personalRecordFindMany.mockResolvedValue([
          storedRecord(RecordType.MAX_WEIGHT, 100, 10),
        ]);
        workoutSetFindMany.mockResolvedValue([]);

        const newRecords = await service.handleSetWrite(
          userId,
          writeParams(makeSet(overrides)),
        );

        expect(newRecords).toHaveLength(0);
        expect(workoutSetFindMany).toHaveBeenCalledTimes(1);
      },
    );

    it('ignores ineligible sets that hold no record', async () => {
      personalRecordFindMany.mockResolvedValue([]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet({ weight: null, reps: null, duration: 10 })),
      );

      expect(newRecords).toHaveLength(0);
      expect(personalRecordUpsert).not.toHaveBeenCalled();
      expect(workoutSetFindMany).not.toHaveBeenCalled();
    });

    it('only tracks MAX_WEIGHT for a set without reps', async () => {
      personalRecordFindMany.mockResolvedValue([]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet({ reps: null })),
      );

      expect(newRecords).toHaveLength(1);
      expect(newRecords[0].recordType).toBe(RecordType.MAX_WEIGHT);
    });

    it('celebrates improved types and recomputes regressed ones in one edit', async () => {
      personalRecordFindMany.mockResolvedValue([
        storedRecord(RecordType.MAX_WEIGHT, 90, 5),
        storedRecord(RecordType.ONE_REP_MAX, 200, 10),
        storedRecord(RecordType.MAX_SET_VOLUME, 450, 5),
      ]);
      workoutSetFindMany.mockResolvedValue([]);

      const newRecords = await service.handleSetWrite(
        userId,
        writeParams(makeSet()),
      );

      expect(newRecords.map((record) => record.recordType)).toEqual([
        RecordType.MAX_WEIGHT,
        RecordType.MAX_SET_VOLUME,
      ]);
      expect(workoutSetFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('recomputeForExercises', () => {
    const recomputeSet = (
      id: number,
      weight: number | null,
      reps: number | null,
      workoutStartedAt: Date,
    ) => ({
      id,
      completed: true,
      type: 'normal',
      weight,
      reps,
      duration: null,
      workoutExercise: { workout: { startedAt: workoutStartedAt } },
    });

    it('picks winners per type with the value/date/id tie-break', async () => {
      workoutSetFindMany.mockResolvedValue([
        recomputeSet(2, 100, 5, new Date('2026-01-02')),
        recomputeSet(3, 100, 5, new Date('2026-01-01')),
        recomputeSet(4, 80, 10, new Date('2026-01-03')),
      ]);

      await service.recomputeForExercises(userId, [exerciseId]);

      // MAX_WEIGHT and ONE_REP_MAX tie between sets 2 and 3 → earliest workout wins.
      expect(personalRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            value: 100,
            achievedAt: new Date('2026-01-01'),
            workoutSetId: 3,
          },
        }),
      );
      expect(personalRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            value: calculateOneRepMax(100, 5),
            achievedAt: new Date('2026-01-01'),
            workoutSetId: 3,
          },
        }),
      );
      // MAX_SET_VOLUME: 80×10 = 800 beats 500.
      expect(personalRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            value: 800,
            achievedAt: new Date('2026-01-03'),
            workoutSetId: 4,
          },
        }),
      );
      expect(personalRecordDeleteMany).not.toHaveBeenCalled();
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('breaks a full tie by lowest set id', async () => {
      const sameDate = new Date('2026-01-01');
      workoutSetFindMany.mockResolvedValue([
        recomputeSet(9, 100, 5, sameDate),
        recomputeSet(4, 100, 5, sameDate),
      ]);

      await service.recomputeForExercises(userId, [exerciseId]);

      expect(personalRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: 100, achievedAt: sameDate, workoutSetId: 4 },
        }),
      );
    });

    it('deletes record types with no eligible sets left', async () => {
      workoutSetFindMany.mockResolvedValue([]);

      await service.recomputeForExercises(userId, [exerciseId]);

      expect(personalRecordUpsert).not.toHaveBeenCalled();
      expect(personalRecordDeleteMany).toHaveBeenCalledTimes(3);
      expect(personalRecordDeleteMany).toHaveBeenCalledWith({
        where: { userId, exerciseId, recordType: RecordType.MAX_WEIGHT },
      });
    });

    it('deletes rep-based records but keeps MAX_WEIGHT for weight-only sets', async () => {
      workoutSetFindMany.mockResolvedValue([
        recomputeSet(2, 120, null, new Date('2026-01-01')),
      ]);

      await service.recomputeForExercises(userId, [exerciseId]);

      expect(personalRecordUpsert).toHaveBeenCalledTimes(1);
      expect(personalRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_exerciseId_recordType: {
              userId,
              exerciseId,
              recordType: RecordType.MAX_WEIGHT,
            },
          },
        }),
      );
      expect(personalRecordDeleteMany).toHaveBeenCalledTimes(2);
    });

    it('does nothing for an empty exercise list', async () => {
      await service.recomputeForExercises(userId, []);

      expect(workoutSetFindMany).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('recomputeAllForUser', () => {
    it('recomputes every exercise the user has logged', async () => {
      workoutExerciseFindMany.mockResolvedValue([
        { exerciseId: 1 },
        { exerciseId: 4 },
      ]);
      const recomputeSpy = jest
        .spyOn(service, 'recomputeForExercises')
        .mockResolvedValue();

      await service.recomputeAllForUser(userId);

      expect(workoutExerciseFindMany).toHaveBeenCalledWith({
        where: { workout: { userId } },
        select: { exerciseId: true },
        distinct: ['exerciseId'],
      });
      expect(recomputeSpy).toHaveBeenCalledWith(userId, [1, 4]);
    });
  });

  describe('getRecords', () => {
    const dbRecord = (
      recordType: RecordType,
      recordExerciseId: number,
      achievedAt: Date,
    ) => ({
      id: 1,
      userId,
      exerciseId: recordExerciseId,
      recordType,
      value: 100,
      achievedAt,
      createdAt: achievedAt,
      workoutSetId: 10,
      exercise: { name: `Exercise ${recordExerciseId}`, category: 'strength' },
      workoutSet: { weight: 100, reps: 5, duration: null, setNumber: 1 },
    });

    it('groups records by exercise and orders types consistently', async () => {
      personalRecordFindMany.mockResolvedValue([
        dbRecord(RecordType.MAX_SET_VOLUME, 2, new Date('2026-08-03')),
        dbRecord(RecordType.MAX_WEIGHT, 1, new Date('2026-08-02')),
        dbRecord(RecordType.MAX_WEIGHT, 2, new Date('2026-08-01')),
      ]);

      const result = await service.getRecords(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        exerciseId: 2,
        exerciseName: 'Exercise 2',
        exerciseCategory: 'strength',
      });
      expect(result[0].records.map((record) => record.recordType)).toEqual([
        RecordType.MAX_WEIGHT,
        RecordType.MAX_SET_VOLUME,
      ]);
      expect(result[1].exerciseId).toBe(1);
      expect(result[1].records[0].set).toEqual({
        weight: 100,
        reps: 5,
        duration: null,
        setNumber: 1,
      });
    });

    it('filters by the workout of the anchoring set when workoutId is given', async () => {
      personalRecordFindMany.mockResolvedValue([]);

      await service.getRecords(userId, { workoutId: 42 });

      expect(personalRecordFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            workoutSet: { workoutExercise: { workoutId: 42 } },
          },
        }),
      );
    });
  });
});
