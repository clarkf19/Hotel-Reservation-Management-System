/** Central, validated access to environment variables. Secrets never have code defaults in production. */
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function required(name, fallbackForTests) {
  const value = process.env[name];
  if (value) return value;
  if (isTest && fallbackForTests !== undefined) return fallbackForTests;
  throw new Error(`Missing required environment variable ${name}. Copy .env.example to server/.env.`);
}

export const env = {
  isTest,
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://hrms:hrms_local_dev@localhost:5433/hrms_test'),
  jwtSecret: required('JWT_SECRET', 'test-secret-only-used-by-automated-tests'),
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES || 20),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  paymentGatewayMode: process.env.PAYMENT_GATEWAY_MODE || 'mock',
  backgroundJobs: process.env.BACKGROUND_JOBS !== 'off' && !isTest,
};
