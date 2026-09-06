export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const SYSTEM_USER_ID = -1;
// The template list endpoint is unpaginated and returns every template with
// its full exercise/set tree, so growth has to stay bounded.
export const MAX_TEMPLATES_PER_USER = 50;
// Confirmation links expire after 24h and can be re-sent, so an account that
// is still unconfirmed (and has never logged in) after this many days is an
// abandoned registration and gets pruned, freeing the email address.
export const UNCONFIRMED_USER_MAX_AGE_DAYS = 30;
// Workout programs. Program trees are read whole (overview, snapshot), so their
// size is bounded per level rather than paginated.
export const MAX_PROGRAMS_PER_USER = 20;
export const MAX_PROGRAM_BLOCKS = 12;
export const MAX_PROGRAM_WEEKS = 52;
export const MAX_DAYS_PER_BLOCK = 14;
export const MAX_EXERCISES_PER_PROGRAM_DAY = 15;
export const MAX_SET_ROWS_PER_PROGRAM_EXERCISE = 120;
export const MAX_ENROLLMENTS_PER_USER = 50;
export const PROGRAM_LIST_LIMIT = 20;
export const ROUNDING_OPTIONS_KG = [0.5, 1, 1.25, 2, 2.5, 5];
