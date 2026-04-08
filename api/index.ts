import { createHttpAppRuntime } from "../src/server.js";

const runtime = createHttpAppRuntime();

// In Vercel's serverless runtime, there is no explicit "listen" callback.
// Mark the app as ready during cold start so /ready works as expected.
runtime.setServerReady(true);

export default runtime.app;
