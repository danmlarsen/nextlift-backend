/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from 'src/email/email.service';
import { Prisma, User } from '@prisma/client';
import { RegisterUserDto } from './dtos/register-user.dto';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { EmailNotConfirmedException } from 'src/common/exceptions/email-not-confirmed-exception';

const sha256hex = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const mockPrismaService = {
  emailConfirmationToken: {
    create: jest.fn().mockResolvedValue({
      token: 'mock-confirmation-token',
    }),
  },
};

const mockUser: User = {
  id: 1,
  userType: 'REGULAR',
  email: 'test@test.com',
  password: 'password',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: new Date(),
  demoExpiresAt: null,
  refreshToken: null,
  isEmailConfirmed: true,
  isActive: true,
};

const mockUsersService: Partial<UsersService> = {
  getUser: jest.fn().mockImplementation((filter: Prisma.UserWhereInput) => {
    if (filter.email === 'test@test.com' || filter.id === 1) {
      return Promise.resolve(mockUser);
    }
    return Promise.resolve(null);
  }),
  createUser: jest.fn().mockImplementation((data: Prisma.UserCreateInput) => {
    return Promise.resolve({
      ...mockUser,
      email: data.email,
      password: data.password,
      isEmailConfirmed: data.isEmailConfirmed || false,
    });
  }),
  updateUser: jest
    .fn()
    .mockImplementation((id: number, data: Prisma.UserUpdateInput) => {
      return Promise.resolve({ ...mockUser, ...data });
    }),
};

const mockEmailService = {
  sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
};

const mockJwtService = {
  sign: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks(); // Clear all mock call history

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: 'PinoLogger:AuthService',
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerUser()', () => {
    let newUserInput: RegisterUserDto;

    beforeEach(() => {
      newUserInput = {
        email: 'new@example.com',
        password: 'plainPassword',
      };
    });

    it('should throw ConflictException when user already exists', async () => {
      const existingUserInput: RegisterUserDto = {
        email: 'test@test.com', // This email exists in our mock
        password: 'password',
      };

      await expect(service.registerUser(existingUserInput)).rejects.toThrow(
        'Email is already in use',
      );

      expect(mockUsersService.getUser).toHaveBeenCalledWith({
        email: 'test@test.com',
      });
      expect(mockUsersService.createUser).not.toHaveBeenCalled();
    });

    it('should hash the password before storing', async () => {
      const result = await service.registerUser(newUserInput);

      // Verify password is hashed correctly
      const isValidPassword = await bcrypt.compare(
        newUserInput.password,
        result.password,
      );
      expect(isValidPassword).toBe(true);
      expect(result.password).not.toBe(newUserInput.password);
    });

    it('should create user with correct data', async () => {
      const result = await service.registerUser(newUserInput);

      expect(mockUsersService.createUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: expect.any(String), // The hashed password
        isEmailConfirmed: false,
      });

      expect(result.email).toBe(newUserInput.email);
      expect(result.isEmailConfirmed).toBe(false);
    });

    it('should create email confirmation token and send confirmation email', async () => {
      await service.registerUser(newUserInput);

      expect(
        mockPrismaService.emailConfirmationToken.create,
      ).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          expiresAt: expect.any(Date),
          userId: 1,
        },
      });

      expect(mockEmailService.sendConfirmationEmail).toHaveBeenCalledWith(
        'new@example.com',
        'mock-confirmation-token',
      );
    });

    it('should return the created user', async () => {
      const result = await service.registerUser(newUserInput);

      expect(result).toMatchObject({
        id: expect.any(Number),
        email: 'new@example.com',
        isEmailConfirmed: false,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(result.password).toBeDefined();
    });

    it('should handle createUser failure', async () => {
      (mockUsersService.createUser as jest.Mock).mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(service.registerUser(newUserInput)).rejects.toThrow(
        'Failed to register user',
      );
    });
  });

  describe('validateUser()', () => {
    beforeEach(async () => {
      // Hash the password for the mock user
      const hashedPassword = await bcrypt.hash('password', 10);
      mockUser.password = hashedPassword;
    });

    it('should return user when valid email and password are provided', async () => {
      const loginDto = {
        email: 'test@test.com',
        password: 'password',
      };

      const result = await service.validateUser(loginDto);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const loginDto = {
        email: 'nonexistent@test.com',
        password: 'password',
      };

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      const loginDto = {
        email: 'test@test.com',
        password: 'wrongpassword',
      };

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw EmailNotConfirmedException when email is not confirmed', async () => {
      const unconfirmedUser = { ...mockUser, isEmailConfirmed: false };
      (mockUsersService.getUser as jest.Mock).mockResolvedValueOnce(
        unconfirmedUser,
      );

      const loginDto = {
        email: 'test@test.com',
        password: 'password',
      };

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        EmailNotConfirmedException,
      );
    });

    it('should throw UnauthorizedException if user is disabled', async () => {
      const unconfirmedUser = { ...mockUser, isActive: false };
      (mockUsersService.getUser as jest.Mock).mockResolvedValueOnce(
        unconfirmedUser,
      );

      const loginDto = {
        email: 'test@test.com',
        password: 'password',
      };

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login()', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('30d');
    });

    it('signs access and refresh tokens carrying a type claim', async () => {
      mockJwtService.sign
        .mockReturnValueOnce('access-token-value')
        .mockReturnValueOnce('refresh-token-value');

      const result = await service.login(mockUser);

      expect(mockJwtService.sign).toHaveBeenNthCalledWith(1, {
        sub: mockUser.id,
        email: mockUser.email,
        type: 'access',
      });
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: mockUser.id, email: mockUser.email, type: 'refresh' },
        { expiresIn: '30d' },
      );
      expect(result.access_token).toBe('access-token-value');
      expect(result.refresh_token).toBe('refresh-token-value');
    });

    it('stores the refresh token hashed via its SHA-256 digest, not the raw token', async () => {
      mockJwtService.sign
        .mockReturnValueOnce('access-token-value')
        .mockReturnValueOnce('refresh-token-value');

      let captured: string | undefined;
      (mockUsersService.updateUser as jest.Mock).mockImplementationOnce(
        (_id: number, data: { refreshToken: string }) => {
          captured = data.refreshToken;
          return Promise.resolve(mockUser);
        },
      );

      await service.login(mockUser);

      expect(captured).toBeDefined();
      const stored = captured as string;
      // The stored value validates against the SHA-256 digest of the token...
      expect(
        await bcrypt.compare(sha256hex('refresh-token-value'), stored),
      ).toBe(true);
      // ...but NOT against the raw token — proving bcrypt's 72-byte truncation
      // can no longer make different tokens collide (N1).
      expect(await bcrypt.compare('refresh-token-value', stored)).toBe(false);
    });
  });

  describe('refreshTokens()', () => {
    it('rejects an invalid or expired refresh token (verifyAsync throws)', async () => {
      mockJwtService.verifyAsync.mockRejectedValueOnce(
        new Error('jwt expired'),
      );

      await expect(service.refreshTokens('garbage')).rejects.toThrow(
        'Invalid token',
      );
      expect(mockUsersService.getUser).not.toHaveBeenCalled();
    });

    it('rejects an access token presented to the refresh endpoint', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'access',
      });

      await expect(service.refreshTokens('an-access-token')).rejects.toThrow(
        'Invalid token',
      );
      expect(mockUsersService.getUser).not.toHaveBeenCalled();
    });

    it('issues a new access token for a valid refresh token', async () => {
      const token = 'valid-refresh-token';
      const storedHash = await bcrypt.hash(sha256hex(token), 10);
      (mockUsersService.getUser as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        refreshToken: storedHash,
      });
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'refresh',
      });
      mockJwtService.sign.mockReturnValueOnce('new-access-token');

      const result = await service.refreshTokens(token);

      expect(result.access_token).toBe('new-access-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'access',
      });
    });

    it('rejects an old refresh token whose hash no longer matches (rotation, N1)', async () => {
      const currentToken = 'current-refresh-token';
      const storedHash = await bcrypt.hash(sha256hex(currentToken), 10);
      (mockUsersService.getUser as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        refreshToken: storedHash,
      });
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: mockUser.id,
        email: mockUser.email,
        type: 'refresh',
      });

      await expect(service.refreshTokens('old-refresh-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  describe('logout()', () => {
    it('nulls the stored refresh token for the user', async () => {
      await service.logout(mockUser.id);

      expect(mockUsersService.updateUser).toHaveBeenCalledWith(mockUser.id, {
        refreshToken: null,
      });
    });
  });
});
