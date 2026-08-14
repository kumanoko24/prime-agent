import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_TIMEOUT_MS = 30_000;
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const launcherPath = join(repositoryRoot, "prime-agent.sh");
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf-8"));
const externalCwd = mkdtempSync(join(tmpdir(), "prime-agent-source-launcher-"));

try {
	const result = spawnSync(launcherPath, ["--version"], {
		cwd: externalCwd,
		encoding: "utf-8",
		timeout: CHECK_TIMEOUT_MS,
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`Source launcher exited with ${result.status ?? "unknown"}:\n${result.stderr}${result.stdout}`);
	}
	const output = `${result.stdout}${result.stderr}`.trim();
	if (output !== packageJson.version) {
		throw new Error(`Source launcher returned ${JSON.stringify(output)}, expected ${packageJson.version}`);
	}
} finally {
	rmSync(externalCwd, { recursive: true, force: true });
}

console.log("Source launcher external-cwd check passed.");
