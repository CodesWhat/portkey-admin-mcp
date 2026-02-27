import app, { setServerReady, ensureReady } from "../src/server.js";

// In Vercel's serverless runtime, there is no explicit "listen" callback.
// Wait for async initialization (OAuth key gen, etc.) then mark ready.
await ensureReady();
setServerReady(true);

export default app;
