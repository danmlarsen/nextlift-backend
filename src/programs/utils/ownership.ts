import { ProgramVisibility } from '@prisma/client';

/** Adds the flags the client needs to tell curated from own programs. */
export function withOwnership<
  T extends { userId: number; visibility: ProgramVisibility },
>(program: T, userId: number) {
  return {
    ...program,
    isOwner: program.userId === userId,
    isSystem: program.visibility === ProgramVisibility.SYSTEM,
  };
}
