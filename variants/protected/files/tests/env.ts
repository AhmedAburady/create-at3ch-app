/** The access code and secret the HTTP tests unlock with. */
export const CODE = "test-code-2031";
export const SECRET = "http-test-secret-0123456789-abcdefgh";

/**
 * The settings the HTTP tests start the production server with. One proxy
 * in front, so each test can be its own client in X-Forwarded-For.
 */
export const TEST_ENV: Record<string, string> = {
  ACCESS_CODE: CODE,
  SESSION_SECRET: SECRET,
  TRUST_PROXY_HOPS: "1",
};
