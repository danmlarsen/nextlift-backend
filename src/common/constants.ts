export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const SYSTEM_USER_ID = -1;
// Confirmation links expire after 24h and can be re-sent, so an account that
// is still unconfirmed (and has never logged in) after this many days is an
// abandoned registration and gets pruned, freeing the email address.
export const UNCONFIRMED_USER_MAX_AGE_DAYS = 30;
