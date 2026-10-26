import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../out", import.meta.url));
if (!existsSync(`${directory}/index.html`))
  throw new Error("Run npm run build first.");
const port = process.argv[2] || "4178";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error("Choose a port from 1024 to 65535.");
const child = spawn(
  "python3",
  ["-m", "http.server", port, "--bind", "127.0.0.1", "--directory", directory],
  { stdio: "inherit" },
);
const deadline = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", (error) => {
  clearTimeout(deadline);
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  clearTimeout(deadline);
  process.exitCode = code || 0;
});
console.log(
  `Local preview: http://127.0.0.1:${port}/ (stops after 10 minutes; Ctrl-C to stop sooner)`,
);
