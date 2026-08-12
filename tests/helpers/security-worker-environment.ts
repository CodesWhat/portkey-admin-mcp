export function configureSecurityWorkerEnvironment(): void {
	process.env.ALLOWED_ORIGINS = "https://admin.example.com";
	delete process.env.CORS_ORIGIN;
	process.env.RATE_LIMIT_ENABLED = "true";
	process.env.RATE_LIMIT_STORE = "memory";
	process.env.RATE_LIMIT_MAX = "2";
	process.env.RATE_LIMIT_WINDOW_MS = "60000";
	process.env.RATE_LIMIT_REFILL = "1";
	process.env.RATE_LIMIT_MAX_BUCKETS = "10";
}
