export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: number;
  email: string;
  // Absent on tokens issued before the access/refresh distinction was added.
  type?: JwtTokenType;
}
