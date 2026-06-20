import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
	DRIVE_FREE_QUOTA_BYTES,
	driveFileRefs,
	driveFiles,
	driveFileVersions,
	driveFolders,
	driveShares,
	storageQuota,
} from "./drive";
import {
	driveFileStatusValues,
	driveRefSourceValues,
	driveSharePermValues,
} from "./enums";

function indexNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	const fromIndexes = cfg.indexes.map(
		(i) => (i as unknown as { config: { name?: string } }).config?.name,
	);
	const fromUniques = cfg.uniqueConstraints.map((u) => u.name);
	return [...fromIndexes, ...fromUniques].filter(
		(n): n is string => typeof n === "string",
	);
}

function checkNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	return cfg.checks.map((c) => c.name);
}

function column(table: PgTable, name: string) {
	return getTableConfig(table).columns.find((c) => c.name === name);
}

// D8/D9 — Drive. Owner decisions DQ1 (R2 primary, u/<userId>/<sha256> keys) +
// DQ2 (10 GiB shared per-user quota, soft-meter overage) shape these tables.
describe("storage_quota (D8 — DQ2 10 GiB shared per-user quota)", () => {
	const cfg = getTableConfig(storageQuota);

	it("defaults quota_bytes to 10 GiB and bytes_used to 0", () => {
		expect(DRIVE_FREE_QUOTA_BYTES).toBe(10_737_418_240);
		const quota = column(storageQuota, "quota_bytes");
		const used = column(storageQuota, "bytes_used");
		expect(quota?.default).toBe(DRIVE_FREE_QUOTA_BYTES);
		expect(used?.default).toBe(0);
		expect(quota?.notNull).toBe(true);
		expect(used?.notNull).toBe(true);
	});

	it("has the overage_opt_in soft-meter flag (DQ2)", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("overage_opt_in");
		expect(column(storageQuota, "overage_opt_in")?.notNull).toBe(true);
	});

	it("uniques one quota row per user + guards bytes_used >= 0", () => {
		expect(indexNames(storageQuota)).toContain("storage_quota_user_uniq");
		expect(checkNames(storageQuota)).toContain(
			"storage_quota_bytes_used_nonneg",
		);
	});
});

describe("drive_folders (D8 — per-user tree)", () => {
	const cfg = getTableConfig(driveFolders);

	it("has a self-referential parent_id + is_system flag", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("drive_folders");
		expect(cols).toContain("user_id");
		expect(cols).toContain("parent_id");
		expect(cols).toContain("name");
		expect(cols).toContain("is_system");
		expect(column(driveFolders, "parent_id")?.notNull).toBe(false); // root
	});

	it("uniques sibling names per dir + indexes the tree", () => {
		const names = indexNames(driveFolders);
		expect(names).toContain("drive_folders_sibling_name_uniq");
		expect(names).toContain("drive_folders_user_parent_idx");
	});
});

describe("drive_files (D8 — content-addressed pointer, DQ1 key scheme)", () => {
	const cfg = getTableConfig(driveFiles);

	it("carries sha256 + storage_key (u/<userId>/<sha256>) + size + status", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("drive_files");
		expect(cols).toContain("user_id");
		expect(cols).toContain("folder_id");
		expect(cols).toContain("name");
		expect(cols).toContain("media_type");
		expect(cols).toContain("size_bytes");
		expect(cols).toContain("sha256");
		expect(cols).toContain("storage_key");
		expect(cols).toContain("status");
		expect(cols).toContain("trashed_at");
		expect(cols).toContain("version");
	});

	it("status is wired to the drive_file_status enum", () => {
		expect(column(driveFiles, "status")?.enumValues).toEqual([
			...driveFileStatusValues,
		]);
	});

	it("dedup lookup + per-(user,content,version) uniqueness + size check", () => {
		const names = indexNames(driveFiles);
		expect(names).toContain("drive_files_user_sha_idx");
		expect(names).toContain("drive_files_user_sha_version_uniq");
		expect(names).toContain("drive_files_user_folder_idx");
		expect(names).toContain("drive_files_status_idx");
		expect(names).toContain("drive_files_trashed_idx");
		expect(checkNames(driveFiles)).toContain("drive_files_size_nonneg");
	});
});

describe("drive_file_versions (D8 — reserved history)", () => {
	it("uniques (file_id, version)", () => {
		const cfg = getTableConfig(driveFileVersions);
		expect(cfg.name).toBe("drive_file_versions");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("file_id");
		expect(cols).toContain("version");
		expect(cols).toContain("storage_key");
		expect(indexNames(driveFileVersions)).toContain(
			"drive_file_versions_file_version_uniq",
		);
	});
});

describe("drive_shares (D8 — public share, file XOR folder)", () => {
	const cfg = getTableConfig(driveShares);

	it("has a unique token, optional password/expiry, takedown + view_count", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("drive_shares");
		expect(cols).toContain("token");
		expect(cols).toContain("password_hash");
		expect(cols).toContain("expires_at");
		expect(cols).toContain("permission");
		expect(cols).toContain("revoked_at");
		expect(cols).toContain("takedown");
		expect(cols).toContain("view_count");
	});

	it("permission wired to drive_share_perm enum", () => {
		expect(column(driveShares, "permission")?.enumValues).toEqual([
			...driveSharePermValues,
		]);
	});

	it("uniques token + enforces exactly one target (file XOR folder)", () => {
		expect(indexNames(driveShares)).toContain("drive_shares_token_uniq");
		expect(checkNames(driveShares)).toContain("drive_shares_one_target");
	});
});

describe("drive_file_refs (D8 — chat/email/canvas bridge)", () => {
	const cfg = getTableConfig(driveFileRefs);

	it("bridges a file to a source domain row", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cfg.name).toBe("drive_file_refs");
		expect(cols).toContain("file_id");
		expect(cols).toContain("source_kind");
		expect(cols).toContain("source_id");
		expect(cols).toContain("organization_id");
	});

	it("source_kind wired to drive_ref_source enum + uniques (kind,id,file)", () => {
		expect(column(driveFileRefs, "source_kind")?.enumValues).toEqual([
			...driveRefSourceValues,
		]);
		expect(indexNames(driveFileRefs)).toContain("drive_file_refs_source_uniq");
	});
});
