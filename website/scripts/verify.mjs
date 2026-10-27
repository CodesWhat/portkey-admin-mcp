import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
for (const script of ["test", "typecheck", "build", "check:export"]) {
  const result = spawnSync("npm", ["run", script], {
    cwd,
    encoding: "utf8",
    timeout: 300_000,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw result.error || new Error(`${script} failed`);
  }
  console.log(`${script} passed`);
}
