/**
 * Prepare native modules for electron-builder.
 *
 * With Bun 1.3+ isolated installs, node_modules contains symlinks to packages
 * stored in node_modules/.bun/. electron-builder cannot follow these symlinks
 * when creating asar archives.
 *
 * This script:
 * 1. Detects if native modules are symlinks
 * 2. Replaces symlinks with actual file copies
 * 3. electron-builder can then properly package and unpack them
 *
 * This is safe because bun install will recreate the symlinks on next install.
 */

import { execSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { maxSatisfying, satisfies } from "semver";
import { requiredMaterializedNodeModules } from "../runtime-dependencies";

// Target architecture for cross-compilation. When set, platform-specific
// packages for this arch are fetched from npm if not already present.
// Set via TARGET_ARCH env var (e.g., TARGET_ARCH=x64).
const TARGET_ARCH = process.env.TARGET_ARCH || process.arch;
const TARGET_PLATFORM = process.env.TARGET_PLATFORM || process.platform;
const NATIVE_DEPENDENCY_TREE_DEPTH = 8;

function getWorkspaceRootNodeModulesDir(nodeModulesDir: string): string {
	return join(nodeModulesDir, "..", "..", "..", "node_modules");
}

function getBunFlatNodeModulesDir(nodeModulesDir: string): string {
	return join(
		getWorkspaceRootNodeModulesDir(nodeModulesDir),
		".bun",
		"node_modules",
	);
}

function getBunStoreDir(nodeModulesDir: string): string {
	return join(getWorkspaceRootNodeModulesDir(nodeModulesDir), ".bun");
}

function findBunStoreFolderName(
	bunStoreDir: string,
	moduleName: string,
	version: string,
): string | null {
	if (!existsSync(bunStoreDir)) return null;
	const entries = readdirSync(bunStoreDir);
	const modulePrefix = `${moduleName.replace("/", "+")}@`;
	const exactPrefix = `${modulePrefix}${version}`;
	const exactMatch = entries.find((entry) => entry.startsWith(exactPrefix));
	if (exactMatch) return exactMatch;
	if (version) return null;
	return entries.find((entry) => entry.startsWith(modulePrefix)) ?? null;
}

function findBunStoreFolderNameSatisfying(
	bunStoreDir: string,
	moduleName: string,
	versionRange: string,
): string | null {
	if (!existsSync(bunStoreDir)) return null;
	const entries = readdirSync(bunStoreDir);
	const modulePrefix = `${moduleName.replace("/", "+")}@`;
	const candidates = entries
		.filter((entry) => entry.startsWith(modulePrefix))
		.map((entry) => {
			const version = entry.slice(modulePrefix.length).split("+")[0];
			return { entry, version };
		});
	const matchingVersion = maxSatisfying(
		candidates.map((candidate) => candidate.version),
		versionRange,
	);
	if (!matchingVersion) return null;
	return (
		candidates.find((candidate) => candidate.version === matchingVersion)
			?.entry ?? null
	);
}

function copyModuleIfSymlink(
	nodeModulesDir: string,
	moduleName: string,
	required: boolean,
): boolean {
	const modulePath = join(nodeModulesDir, moduleName);
	const bunFlatNodeModulesDir = getBunFlatNodeModulesDir(nodeModulesDir);
	const bunFlatModulePath = join(bunFlatNodeModulesDir, moduleName);

	if (!existsSync(modulePath)) {
		if (existsSync(bunFlatModulePath)) {
			console.log(`  ${moduleName}: materializing from Bun store index`);
			mkdirSync(dirname(modulePath), { recursive: true });
			cpSync(realpathSync(bunFlatModulePath), modulePath, { recursive: true });
			console.log(`    Copied to: ${modulePath}`);
			return true;
		}
		const bunStoreFolderName = findBunStoreFolderName(
			getBunStoreDir(nodeModulesDir),
			moduleName,
			"",
		);
		if (bunStoreFolderName) {
			const modulePrefix = `${moduleName.replace("/", "+")}@`;
			const storeVersion = bunStoreFolderName.startsWith(modulePrefix)
				? bunStoreFolderName.slice(modulePrefix.length).split("+")[0]
				: null;
			const bunStoreModulePath = join(
				getBunStoreDir(nodeModulesDir),
				bunStoreFolderName,
				"node_modules",
				moduleName,
			);
			if (existsSync(bunStoreModulePath)) {
				console.log(`  ${moduleName}: materializing from Bun store`);
				mkdirSync(dirname(modulePath), { recursive: true });
				cpSync(bunStoreModulePath, modulePath, { recursive: true });
				console.log(`    Copied to: ${modulePath}`);
				return true;
			}
			if (required && storeVersion) {
				console.log(
					`  ${moduleName}: Bun store payload missing; fetching ${storeVersion} from npm`,
				);
				if (fetchNpmPackage(moduleName, storeVersion, modulePath)) {
					return true;
				}
			}
		}
		if (required) {
			console.error(`  [ERROR] ${moduleName} not found at ${modulePath}`);
			process.exit(1);
		}
		console.log(`  ${moduleName}: not found (skipping)`);
		return false;
	}

	const stats = lstatSync(modulePath);

	if (stats.isSymbolicLink()) {
		// Resolve symlink to get real path
		const realPath = realpathSync(modulePath);
		console.log(`  ${moduleName}: symlink -> replacing with real files`);
		console.log(`    Real path: ${realPath}`);

		// Remove the symlink. On Windows, bun creates directory junctions/symlinks
		// that rmSync rejects without `recursive` (ERR_FS_EISDIR); recursive+force
		// removes the link itself (not the target) cross-platform.
		rmSync(modulePath, { recursive: true, force: true });

		// Copy the actual files
		cpSync(realPath, modulePath, { recursive: true });

		console.log(`    Copied to: ${modulePath}`);
	} else {
		console.log(`  ${moduleName}: already real directory (not a symlink)`);
	}

	return true;
}

function copyNestedDependencyForPackage(
	nodeModulesDir: string,
	parentModuleName: string,
	dependencyName: string,
	required: boolean,
): void {
	const parentPath = join(nodeModulesDir, parentModuleName);
	if (!existsSync(parentPath)) {
		if (required) {
			console.error(`  [ERROR] ${parentModuleName} not found at ${parentPath}`);
			process.exit(1);
		}
		return;
	}

	if (!copyModuleIfSymlink(nodeModulesDir, dependencyName, required)) {
		return;
	}

	const sourcePath = join(nodeModulesDir, dependencyName);
	const nestedDependencyPath = join(parentPath, "node_modules", dependencyName);

	if (existsSync(nestedDependencyPath)) {
		const nestedStats = lstatSync(nestedDependencyPath);
		if (!nestedStats.isSymbolicLink()) {
			console.log(
				`  ${parentModuleName} -> ${dependencyName}: refreshing real directory`,
			);
		}
	}

	console.log(
		`  ${parentModuleName} -> ${dependencyName}: materializing nested dependency`,
	);
	rmSync(nestedDependencyPath, { recursive: true, force: true });
	mkdirSync(dirname(nestedDependencyPath), { recursive: true });
	cpSync(realpathSync(sourcePath), nestedDependencyPath, { recursive: true });
}

function versionSatisfiesRange(
	version: string,
	dependencyRange: string,
): boolean {
	try {
		return satisfies(version, dependencyRange);
	} catch {
		return false;
	}
}

function resolveDependencySourcePath(
	nodeModulesDir: string,
	dependencyName: string,
	required: boolean,
	dependencyRange = "",
): string | null {
	const topLevelDependencyPath = join(nodeModulesDir, dependencyName);
	if (!dependencyRange) {
		if (!copyModuleIfSymlink(nodeModulesDir, dependencyName, required)) {
			return null;
		}
		return topLevelDependencyPath;
	}

	const topLevelVersion = readInstalledModuleVersion(topLevelDependencyPath);
	if (
		topLevelVersion &&
		versionSatisfiesRange(topLevelVersion, dependencyRange)
	) {
		if (!copyModuleIfSymlink(nodeModulesDir, dependencyName, required)) {
			return null;
		}
		return topLevelDependencyPath;
	}

	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	const bunStoreFolderName = findBunStoreFolderNameSatisfying(
		bunStoreDir,
		dependencyName,
		dependencyRange,
	);
	if (bunStoreFolderName) {
		const sourcePath = join(
			bunStoreDir,
			bunStoreFolderName,
			"node_modules",
			dependencyName,
		);
		if (existsSync(sourcePath)) {
			console.log(
				`  ${dependencyName}: using Bun store version for range ${dependencyRange}`,
			);
			return sourcePath;
		}
	}

	if (!topLevelVersion) {
		if (!copyModuleIfSymlink(nodeModulesDir, dependencyName, required)) {
			return null;
		}
		return topLevelDependencyPath;
	}

	if (required) {
		console.error(
			`  [ERROR] ${dependencyName}@${topLevelVersion} does not satisfy ${dependencyRange} and no matching Bun store package was found`,
		);
		process.exit(1);
	}

	return null;
}

function copyDependencyIntoPackage(
	nodeModulesDir: string,
	parentPackagePath: string,
	dependencyName: string,
	required: boolean,
	dependencyRange = "",
): string | null {
	const sourcePath = resolveDependencySourcePath(
		nodeModulesDir,
		dependencyName,
		required,
		dependencyRange,
	);
	if (!sourcePath) {
		return null;
	}

	const nestedDependencyPath = join(
		parentPackagePath,
		"node_modules",
		dependencyName,
	);

	if (existsSync(nestedDependencyPath)) {
		const nestedStats = lstatSync(nestedDependencyPath);
		if (!nestedStats.isSymbolicLink()) {
			console.log(
				`  ${dependencyName}: refreshing nested dependency in ${parentPackagePath}`,
			);
		}
	}

	rmSync(nestedDependencyPath, { recursive: true, force: true });
	mkdirSync(dirname(nestedDependencyPath), { recursive: true });
	cpSync(realpathSync(sourcePath), nestedDependencyPath, { recursive: true });
	return nestedDependencyPath;
}

function getBunStorePackagePath(
	nodeModulesDir: string,
	packagePath: string,
): string | null {
	const packageJsonPath = join(packagePath, "package.json");
	if (!existsSync(packageJsonPath)) return null;

	type PackageJson = { name?: string; version?: string };
	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as PackageJson;
	if (!packageJson.name || !packageJson.version) return null;

	const bunStoreFolderName = findBunStoreFolderName(
		getBunStoreDir(nodeModulesDir),
		packageJson.name,
		packageJson.version,
	);
	if (!bunStoreFolderName) return null;

	const bunStorePackagePath = join(
		getBunStoreDir(nodeModulesDir),
		bunStoreFolderName,
		"node_modules",
		packageJson.name,
	);
	if (!existsSync(bunStorePackagePath)) return null;

	try {
		if (realpathSync(bunStorePackagePath) === realpathSync(packagePath)) {
			return null;
		}
	} catch {
		return null;
	}

	return bunStorePackagePath;
}

function copyDependencyIntoBunStorePackage(
	nodeModulesDir: string,
	parentPackagePath: string,
	dependencyName: string,
	required: boolean,
	dependencyRange = "",
): string | null {
	const bunStorePackagePath = getBunStorePackagePath(
		nodeModulesDir,
		parentPackagePath,
	);
	if (!bunStorePackagePath) return null;

	return copyDependencyIntoPackage(
		nodeModulesDir,
		bunStorePackagePath,
		dependencyName,
		required,
		dependencyRange,
	);
}

function materializePackageDependencyTree(
	nodeModulesDir: string,
	packagePath: string,
	depth: number,
	seen = new Set<string>(),
): void {
	if (depth <= 0) return;
	const packageJsonPath = join(packagePath, "package.json");
	if (!existsSync(packageJsonPath)) return;

	const seenKey = `${packagePath}:${depth}`;
	if (seen.has(seenKey)) return;
	seen.add(seenKey);

	type PackageJson = { dependencies?: Record<string, string> };
	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as PackageJson;

	for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
		const dependencyRange = packageJson.dependencies?.[dependencyName] ?? "";
		const nestedDependencyPath = copyDependencyIntoPackage(
			nodeModulesDir,
			packagePath,
			dependencyName,
			true,
			dependencyRange,
		);
		const bunStoreNestedDependencyPath = copyDependencyIntoBunStorePackage(
			nodeModulesDir,
			packagePath,
			dependencyName,
			true,
			dependencyRange,
		);
		const topLevelDependencyPath = join(nodeModulesDir, dependencyName);
		if (existsSync(topLevelDependencyPath)) {
			materializePackageDependencyTree(
				nodeModulesDir,
				topLevelDependencyPath,
				depth - 1,
				seen,
			);
		}
		if (nestedDependencyPath) {
			materializePackageDependencyTree(
				nodeModulesDir,
				nestedDependencyPath,
				depth - 1,
				seen,
			);
		}
		if (bunStoreNestedDependencyPath) {
			materializePackageDependencyTree(
				nodeModulesDir,
				bunStoreNestedDependencyPath,
				depth - 1,
				seen,
			);
		}
	}
}

function readInstalledModuleVersion(modulePath: string): string | null {
	const packageJsonPath = join(modulePath, "package.json");
	if (!existsSync(packageJsonPath)) return null;
	type PackageJson = { version?: string };
	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as PackageJson;
	return packageJson.version ?? null;
}

function copyExactModuleVersion(
	nodeModulesDir: string,
	moduleName: string,
	version: string,
	destPath: string,
	required: boolean,
): boolean {
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	const bunStoreFolderName =
		findBunStoreFolderName(bunStoreDir, moduleName, version) ??
		findBunStoreFolderNameSatisfying(bunStoreDir, moduleName, version);
	if (bunStoreFolderName) {
		const sourcePath = join(
			bunStoreDir,
			bunStoreFolderName,
			"node_modules",
			moduleName,
		);
		if (existsSync(sourcePath)) {
			mkdirSync(dirname(destPath), { recursive: true });
			cpSync(sourcePath, destPath, { recursive: true });
			console.log(`    Copied ${moduleName}@${version} to: ${destPath}`);
			return true;
		}
	}

	if (fetchNpmPackage(moduleName, version, destPath)) {
		return true;
	}

	if (required) {
		console.error(
			`  [ERROR] Failed to materialize ${moduleName}@${version} at ${destPath}`,
		);
		process.exit(1);
	}

	return false;
}

function copyDependencyForPackage(
	nodeModulesDir: string,
	parentModuleName: string,
	dependencyName: string,
	dependencyRange: string,
	required: boolean,
): void {
	const topLevelDependencyPath = join(nodeModulesDir, dependencyName);
	const topLevelVersion = readInstalledModuleVersion(topLevelDependencyPath);

	if (topLevelVersion && satisfies(topLevelVersion, dependencyRange)) {
		copyModuleIfSymlink(nodeModulesDir, dependencyName, required);
		return;
	}

	if (!topLevelVersion) {
		console.log(
			`  ${dependencyName}: top-level version missing; materializing ${dependencyRange} at the workspace root`,
		);
		copyExactModuleVersion(
			nodeModulesDir,
			dependencyName,
			dependencyRange,
			topLevelDependencyPath,
			required,
		);
		return;
	}

	const nestedDependencyPath = join(
		nodeModulesDir,
		parentModuleName,
		"node_modules",
		dependencyName,
	);
	const nestedVersion = readInstalledModuleVersion(nestedDependencyPath);
	if (nestedVersion && satisfies(nestedVersion, dependencyRange)) {
		const nestedStats = lstatSync(nestedDependencyPath);
		if (nestedStats.isSymbolicLink()) {
			const realPath = realpathSync(nestedDependencyPath);
			// recursive+force so Windows directory junctions/symlinks are removed too
			rmSync(nestedDependencyPath, { recursive: true, force: true });
			cpSync(realPath, nestedDependencyPath, {
				recursive: true,
			});
		}
		return;
	}

	console.log(
		`  ${dependencyName}: top-level version ${topLevelVersion ?? "missing"} does not satisfy ${dependencyRange}; materializing nested copy for ${parentModuleName}`,
	);

	copyExactModuleVersion(
		nodeModulesDir,
		dependencyName,
		dependencyRange,
		nestedDependencyPath,
		required,
	);
}

/**
 * Fetch an npm package tarball and extract it to destPath.
 * Used when cross-compiling and the target platform package isn't in the Bun store.
 */
function fetchNpmPackage(
	packageName: string,
	version: string,
	destPath: string,
): boolean {
	// npm tarball URL: @scope/pkg/-/pkg-version.tgz (filename uses pkg name without scope)
	const barePackageName = packageName.includes("/")
		? packageName.split("/")[1]
		: packageName;
	const url = `https://registry.npmjs.org/${packageName}/-/${barePackageName}-${version}.tgz`;
	console.log(`  ${packageName}: fetching from npm (${version})`);
	try {
		rmSync(destPath, { recursive: true, force: true });
		mkdirSync(destPath, { recursive: true });
		execSync(
			`curl -sL "${url}" | tar xz -C "${destPath}" --strip-components=1`,
			{
				stdio: "pipe",
			},
		);
		console.log(`    Extracted to: ${destPath}`);
		return true;
	} catch (err) {
		console.error(
			`  [ERROR] Failed to fetch ${packageName}@${version}: ${err}`,
		);
		return false;
	}
}

function copyAstGrepPlatformPackages(nodeModulesDir: string): void {
	const astGrepNapiPath = join(nodeModulesDir, "@ast-grep", "napi");
	if (!existsSync(astGrepNapiPath)) return;

	const astGrepPkgJsonPath = join(astGrepNapiPath, "package.json");
	if (!existsSync(astGrepPkgJsonPath)) return;

	type AstGrepPackageJson = {
		optionalDependencies?: Record<string, string>;
	};
	const astGrepPkg = JSON.parse(
		readFileSync(astGrepPkgJsonPath, "utf8"),
	) as AstGrepPackageJson;
	const optionalDeps = astGrepPkg.optionalDependencies ?? {};
	const platformPackages = Object.entries(optionalDeps)
		.filter(([name]) => name.startsWith("@ast-grep/napi-"))
		.map(([name, version]) => ({ name, version }));

	if (platformPackages.length === 0) return;

	// Determine which platform package we need for the target arch
	const targetPlatformSuffix = `${TARGET_PLATFORM === "darwin" ? "darwin" : TARGET_PLATFORM === "win32" ? "win32" : "linux"}-${TARGET_ARCH}`;
	const targetPkg = platformPackages.find((pkg) =>
		pkg.name.includes(targetPlatformSuffix),
	);

	// Bun isolated installs keep package payloads in workspaceRoot/node_modules/.bun
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	let resolvedTargetPackage = false;

	for (const platformPkg of platformPackages) {
		const isTargetPkg = targetPkg && platformPkg.name === targetPkg.name;
		const destPath = join(nodeModulesDir, platformPkg.name);
		if (existsSync(destPath)) {
			const copied = copyModuleIfSymlink(
				nodeModulesDir,
				platformPkg.name,
				false,
			);
			if (isTargetPkg && copied) resolvedTargetPackage = true;
			continue;
		}

		const bunStoreFolderName = findBunStoreFolderName(
			bunStoreDir,
			platformPkg.name,
			platformPkg.version,
		);
		if (bunStoreFolderName) {
			const sourcePath = join(
				bunStoreDir,
				bunStoreFolderName,
				"node_modules",
				platformPkg.name,
			);
			if (existsSync(sourcePath)) {
				console.log(`  ${platformPkg.name}: copying from Bun store`);
				mkdirSync(dirname(destPath), { recursive: true });
				cpSync(sourcePath, destPath, { recursive: true });
				if (isTargetPkg) resolvedTargetPackage = true;
				continue;
			}
		}

		// If this is the target platform package and it's not in the Bun store,
		// fetch it from npm (cross-compilation scenario)
		if (isTargetPkg) {
			if (fetchNpmPackage(platformPkg.name, platformPkg.version, destPath)) {
				resolvedTargetPackage = true;
				continue;
			}
		}

		console.warn(
			`  ${platformPkg.name}: not found in Bun store or node_modules`,
		);
	}

	if (!resolvedTargetPackage) {
		console.error(
			`  [ERROR] Target platform package ${targetPkg?.name ?? `@ast-grep/napi-${targetPlatformSuffix}`} was not materialized`,
		);
		process.exit(1);
	}
}

function copyLibsqlDependencies(nodeModulesDir: string): void {
	const libsqlPath = join(nodeModulesDir, "libsql");
	const libsqlPkgJsonPath = join(libsqlPath, "package.json");
	if (!existsSync(libsqlPkgJsonPath)) return;

	type LibsqlPackageJson = {
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
	};
	const libsqlPkg = JSON.parse(
		readFileSync(libsqlPkgJsonPath, "utf8"),
	) as LibsqlPackageJson;
	const deps = libsqlPkg.dependencies ?? {};
	const optionalDeps = libsqlPkg.optionalDependencies ?? {};

	console.log("\nPreparing libsql runtime dependencies...");
	for (const [dep, version] of Object.entries(deps)) {
		copyDependencyForPackage(nodeModulesDir, "libsql", dep, version, true);
	}

	// Copy whichever optional native platform packages Bun installed for this platform.
	for (const dep of Object.keys(optionalDeps)) {
		copyModuleIfSymlink(nodeModulesDir, dep, false);
	}

	// Some Bun installs place optional deps under .bun/node_modules/@scope.
	// Mirror discovered @libsql optional packages if present there.
	const bunFlatLibsqlScopePath = join(
		getBunFlatNodeModulesDir(nodeModulesDir),
		"@libsql",
	);
	if (existsSync(bunFlatLibsqlScopePath)) {
		for (const entry of readdirSync(bunFlatLibsqlScopePath)) {
			if (
				!entry.includes("darwin") &&
				!entry.includes("linux") &&
				!entry.includes("win32")
			) {
				continue;
			}
			copyModuleIfSymlink(nodeModulesDir, `@libsql/${entry}`, false);
		}
	}

	// Cross-compilation: ensure the target platform's @libsql package is present
	const targetSuffix = `${TARGET_PLATFORM}-${TARGET_ARCH}`;
	const targetLibsqlPkgs = Object.entries(optionalDeps).filter(([name]) =>
		name.includes(targetSuffix),
	);
	for (const [name, version] of targetLibsqlPkgs) {
		const destPath = join(nodeModulesDir, name);
		if (!existsSync(destPath)) {
			fetchNpmPackage(name, version, destPath);
		}
	}
}

function copyParcelWatcherPlatformPackages(nodeModulesDir: string): void {
	const watcherPath = join(nodeModulesDir, "@parcel", "watcher");
	const watcherPkgJsonPath = join(watcherPath, "package.json");
	if (!existsSync(watcherPkgJsonPath)) return;

	type ParcelWatcherPackageJson = {
		optionalDependencies?: Record<string, string>;
	};
	const watcherPkg = JSON.parse(
		readFileSync(watcherPkgJsonPath, "utf8"),
	) as ParcelWatcherPackageJson;
	const optionalDeps = watcherPkg.optionalDependencies ?? {};
	const platformPackages = Object.entries(optionalDeps)
		.filter(([name]) => name.startsWith("@parcel/watcher-"))
		.map(([name, version]) => ({ name, version }));

	if (platformPackages.length === 0) return;

	console.log("\nPreparing parcel watcher platform package...");
	const bunStoreDir = getBunStoreDir(nodeModulesDir);
	let resolvedPlatformPackage = false;

	for (const platformPkg of platformPackages) {
		const destPath = join(nodeModulesDir, platformPkg.name);
		if (existsSync(destPath)) {
			resolvedPlatformPackage =
				copyModuleIfSymlink(nodeModulesDir, platformPkg.name, false) ||
				resolvedPlatformPackage;
			continue;
		}

		const bunStoreFolderName = findBunStoreFolderName(
			bunStoreDir,
			platformPkg.name,
			platformPkg.version,
		);
		if (!bunStoreFolderName) {
			console.warn(
				`  ${platformPkg.name}: no Bun store entry matched version ${platformPkg.version}`,
			);
			continue;
		}

		const sourcePath = join(
			bunStoreDir,
			bunStoreFolderName,
			"node_modules",
			platformPkg.name,
		);
		if (!existsSync(sourcePath)) {
			console.warn(
				`  ${platformPkg.name}: Bun store path missing after resolve (${sourcePath})`,
			);
			continue;
		}

		console.log(`  ${platformPkg.name}: copying from Bun store`);
		mkdirSync(dirname(destPath), { recursive: true });
		cpSync(sourcePath, destPath, { recursive: true });
		resolvedPlatformPackage = true;
	}

	if (!resolvedPlatformPackage) {
		console.error(
			"  [ERROR] No `@parcel/watcher-<platform>` runtime package was materialized",
		);
		process.exit(1);
	}
}

function copyDuckdbPlatformPackages(nodeModulesDir: string): void {
	const nodeBindingsPath = join(nodeModulesDir, "@duckdb", "node-bindings");
	const nodeBindingsPkgJsonPath = join(nodeBindingsPath, "package.json");
	if (!existsSync(nodeBindingsPkgJsonPath)) return;

	type DuckdbBindingsPackageJson = {
		optionalDependencies?: Record<string, string>;
	};
	const nodeBindingsPkg = JSON.parse(
		readFileSync(nodeBindingsPkgJsonPath, "utf8"),
	) as DuckdbBindingsPackageJson;
	const optionalDeps = nodeBindingsPkg.optionalDependencies ?? {};

	console.log("\nPreparing duckdb platform package...");

	// The native binding is a `cpu`/`os`-gated optional dependency, so Bun only
	// installs the host's. For the target arch, fetch it from npm when missing.
	const targetSuffix = `${TARGET_PLATFORM}-${TARGET_ARCH}`;
	const targetEntry = Object.entries(optionalDeps).find(([name]) =>
		name.endsWith(targetSuffix),
	);
	if (!targetEntry) {
		console.error(
			`  [ERROR] No @duckdb/node-bindings optional dependency matched ${targetSuffix}`,
		);
		process.exit(1);
	}

	const [targetName, targetVersion] = targetEntry;
	const destPath = join(nodeModulesDir, targetName);
	if (existsSync(destPath)) {
		copyModuleIfSymlink(nodeModulesDir, targetName, true);
		return;
	}

	copyExactModuleVersion(
		nodeModulesDir,
		targetName,
		targetVersion,
		destPath,
		true,
	);
}

function prepareNativeModules() {
	console.log("Preparing external runtime modules for electron-builder...");
	console.log(
		`  Target: ${TARGET_PLATFORM}/${TARGET_ARCH} (host: ${process.platform}/${process.arch})`,
	);

	// bun creates symlinks for direct dependencies in the workspace's node_modules
	const nodeModulesDir = join(dirname(import.meta.dirname), "node_modules");

	console.log("\nMaterializing packaged runtime modules...");
	for (const moduleName of requiredMaterializedNodeModules) {
		copyModuleIfSymlink(nodeModulesDir, moduleName, true);
	}

	console.log("\nMaterializing native package dependency trees...");
	for (const moduleName of [
		"better-sqlite3",
		"node-pty",
		"@parcel/watcher",
		"libsql",
	]) {
		materializePackageDependencyTree(
			nodeModulesDir,
			join(nodeModulesDir, moduleName),
			NATIVE_DEPENDENCY_TREE_DEPTH,
		);
	}

	console.log("\nMaterializing workspace package runtime dependencies...");
	copyNestedDependencyForPackage(
		nodeModulesDir,
		"@rox/host-service",
		"better-sqlite3",
		true,
	);
	copyNestedDependencyForPackage(
		nodeModulesDir,
		"@rox/host-service",
		"node-pty",
		true,
	);

	console.log("\nPreparing ast-grep platform package...");
	copyAstGrepPlatformPackages(nodeModulesDir);
	copyParcelWatcherPlatformPackages(nodeModulesDir);
	copyLibsqlDependencies(nodeModulesDir);
	copyDuckdbPlatformPackages(nodeModulesDir);

	console.log("\nDone!");
}

prepareNativeModules();
