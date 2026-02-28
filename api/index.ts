import app, { setServerReady } from "../src/server.js";

// In Vercel's serverless runtime, there is no explicit "listen" callback.
// Mark the app as ready during cold start so /ready works as expected.
setServerReady(true);

export default app;
