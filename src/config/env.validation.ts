/**
 * Fail-fast environment validation run by ConfigModule at startup.
 *
 * Kept dependency-free (no Joi/class-validator) on purpose: it only asserts
 * that the variables the app cannot run correctly without are present.
 */
export function validateEnv(config: Record<string, unknown>) {
  const isProduction = config.NODE_ENV === 'production';

  const alwaysRequired = ['DATABASE_URL', 'JWT_SECRET'];

  // Only meaningful in production: dev/docker-compose supplies sensible
  // defaults, and SENDGRID_API_KEY intentionally falls back to a console mock.
  const productionRequired = [
    'CORS_ORIGIN',
    'FRONTEND_URL',
    'SENDGRID_VERIFIED_SENDER_EMAIL',
    'RECAPTCHA_SECRET',
  ];

  const required = isProduction
    ? [...alwaysRequired, ...productionRequired]
    : alwaysRequired;

  const missing = required.filter((key) => {
    const value = config[key];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return config;
}
