import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env";

export type RoxConfig = {
	auth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	};
	apiKey?: string;
	organizationId?: string;
};

export const ROX_HOME_DIR = process.env.ROX_HOME_DIR ?? join(homedir(), ".rox");
export const ROX_CONFIG_PATH = join(ROX_HOME_DIR, "config.json");

function ensureDir() {
	if (!existsSync(ROX_HOME_DIR)) {
		mkdirSync(ROX_HOME_DIR, { recursive: true, mode: 0o700 });
	}
	try {
		const stat = statSync(ROX_HOME_DIR);
		if ((stat.mode & 0o077) !== 0) chmodSync(ROX_HOME_DIR, 0o700);
	} catch {}
}

export function readConfig(): RoxConfig {
	if (!existsSync(ROX_CONFIG_PATH)) return {};
	try {
		const stat = statSync(ROX_CONFIG_PATH);
		if ((stat.mode & 0o077) !== 0) chmodSync(ROX_CONFIG_PATH, 0o600);
	} catch {}
	return JSON.parse(readFileSync(ROX_CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: RoxConfig): void {
	ensureDir();
	const tempPath = join(
		ROX_HOME_DIR,
		`.${randomUUID()}.${process.pid}.config.tmp`,
	);
	writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
	try {
		chmodSync(tempPath, 0o600);
	} catch {}
	try {
		renameSync(tempPath, ROX_CONFIG_PATH);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw error;
	}
	try {
		chmodSync(ROX_CONFIG_PATH, 0o600);
	} catch {}
}

export function getApiUrl(): string {
	return env.ROX_API_URL;
}
