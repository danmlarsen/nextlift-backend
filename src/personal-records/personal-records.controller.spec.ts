import { Test, TestingModule } from '@nestjs/testing';
import { PersonalRecordsController } from './personal-records.controller';
import { PersonalRecordsService } from './personal-records.service';

describe('PersonalRecordsController', () => {
  let controller: PersonalRecordsController;
  const getRecords = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonalRecordsController],
      providers: [
        { provide: PersonalRecordsService, useValue: { getRecords } },
      ],
    }).compile();

    controller = module.get<PersonalRecordsController>(
      PersonalRecordsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to the service with the current user and workout filter', async () => {
    getRecords.mockResolvedValue([]);

    await controller.getPersonalRecords(
      { id: 7, email: 'user@example.com' },
      42,
    );

    expect(getRecords).toHaveBeenCalledWith(7, { workoutId: 42 });
  });
});
