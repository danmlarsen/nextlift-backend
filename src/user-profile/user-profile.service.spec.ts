import { Test, TestingModule } from '@nestjs/testing';
import { UserProfileService } from './user-profile.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpsertUserProfileDto } from './dtos/upsert-user-profile.dto';

describe('UserProfileService', () => {
  let service: UserProfileService;
  const prismaMock = {
    userProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:UserProfileService',
          useValue: { info: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UserProfileService>(UserProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('upserts scoped to the user id', async () => {
    const dto = { heightCm: 180 } as UpsertUserProfileDto;
    await service.upsertProfile(42, dto);
    expect(prismaMock.userProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 42 },
      create: { heightCm: 180, userId: 42 },
      update: dto,
    });
  });
});
