const { execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function parsePackagedAppHelperPids({
	processList,
	packagedAppRoot,
	currentPid = process.pid,
}) {
	const root = path.resolve(packagedAppRoot);
	const rootContentsPrefix = `${root}/Contents/`;
	const seen = new Set();
	const pids = [];

	for (const line of String(processList || "").split(/\r?\n/)) {
		const match = line.match(/^\s*(\d+)\s+(.+)$/);
		if (!match) continue;

		const pid = Number(match[1]);
		const command = match[2] ?? "";
		if (!Number.isFinite(pid) || pid === currentPid || seen.has(pid)) {
			continue;
		}
		if (!command.includes(rootContentsPrefix)) {
			continue;
		}

		seen.add(pid);
		pids.push(pid);
	}

	return pids;
}

async function listProcessTable() {
	const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,command="], {
		maxBuffer: 5 * 1024 * 1024,
	});
	return stdout;
}

async function cleanupPackagedAppHelpers({
	packagedAppRoot,
	currentPid = process.pid,
	signal = "SIGTERM",
	settleMs = 500,
}) {
	const processList = await listProcessTable();
	const killedPids = parsePackagedAppHelperPids({
		processList,
		packagedAppRoot,
		currentPid,
	});

	for (const pid of killedPids) {
		try {
			process.kill(pid, signal);
		} catch (error) {
			if (error?.code !== "ESRCH") throw error;
		}
	}

	if (killedPids.length > 0 && settleMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, settleMs));
	}

	return { killedPids };
}

module.exports = {
	cleanupPackagedAppHelpers,
	parsePackagedAppHelperPids,
};
