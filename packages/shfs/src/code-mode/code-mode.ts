import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	createInMemoryFileSystem,
	createKernel,
	createNodeRuntime,
	createWasmVmRuntime,
	type Kernel,
	type KernelBootTiming,
	type Permissions,
	type VirtualFileSystem,
} from '@secure-exec/core/test-runtime';
import {
	DiagnosticCategory,
	type FormatDiagnosticsHost,
	formatDiagnostics,
	ModuleKind,
	ModuleResolutionKind,
	ScriptTarget,
	transpileModule,
} from 'typescript';

import type { FS } from '../fs';
import { normalizePath } from '../util/path';

const DEFAULT_CWD = '/';
const CODE_MODE_TMP_DIR = '/tmp/shfs-code-mode';
const DEFAULT_TIMEOUT_MS = 5000;
const INTERNAL_MOUNT_PATH = '/workspace';
const LEADING_SLASHES_REGEX = /^\/+/;

const DEFAULT_PERMISSIONS: Permissions = {
	fs: 'allow',
	childProcess: 'allow',
	process: 'allow',
	env: 'allow',
	network: 'deny',
};

const diagnosticHost: FormatDiagnosticsHost = {
	getCanonicalFileName: (fileName) => fileName,
	getCurrentDirectory: () => '/',
	getNewLine: () => '\n',
};

export interface CreateCodeModeOptions {
	readonly commandsDir?: string;
	readonly cwd?: string;
	readonly env?: Record<string, string>;
	readonly onBootTiming?: (timing: KernelBootTiming) => void;
	readonly permissions?: Permissions;
	readonly readOnly?: boolean;
	readonly timeoutMs?: number;
}

export type CodeModeLanguage = 'js' | 'ts';

export interface CodeModeExecOptions {
	readonly cwd?: string;
	readonly env?: Record<string, string>;
	readonly fileName?: string;
	readonly language?: CodeModeLanguage;
	readonly timeoutMs?: number;
}

export interface CodeModeResult<T = unknown> {
	readonly exitCode: number;
	readonly stderr: string;
	readonly stdout: string;
	readonly value?: T;
}

export class CodeMode {
	private readonly defaults: { cwd: string; timeoutMs: number };
	private readonly fs: FS;
	private readonly kernel: Kernel;
	private runId = 0;

	constructor(
		kernel: Kernel,
		fs: FS,
		defaults: { cwd: string; timeoutMs: number }
	) {
		this.kernel = kernel;
		this.fs = fs;
		this.defaults = defaults;
	}

	async exec<T = unknown>(
		source: string,
		options: CodeModeExecOptions = {}
	): Promise<CodeModeResult<T>> {
		if ((options.language ?? 'ts') === 'js') {
			return await this.execJavaScript<T>(source, options);
		}

		const transpiled = transpileModule(source, {
			compilerOptions: {
				esModuleInterop: true,
				module: ModuleKind.ESNext,
				moduleResolution: ModuleResolutionKind.Bundler,
				strict: true,
				target: ScriptTarget.ES2022,
			},
			fileName: options.fileName ?? 'shfs-code-mode.ts',
			reportDiagnostics: true,
		});
		const diagnostics =
			transpiled.diagnostics?.filter(
				(diagnostic) => diagnostic.category === DiagnosticCategory.Error
			) ?? [];
		if (diagnostics.length > 0) {
			return {
				exitCode: 1,
				stderr: formatDiagnostics(diagnostics, diagnosticHost),
				stdout: '',
			};
		}
		return await this.execJavaScript<T>(transpiled.outputText, options);
	}

	private async execJavaScript<T = unknown>(
		source: string,
		options: CodeModeExecOptions = {}
	): Promise<CodeModeResult<T>> {
		const runPath = `${CODE_MODE_TMP_DIR}/${Date.now().toString(36)}-${this.runId}`;
		this.runId += 1;
		const entryPath = `${runPath}/entry.mjs`;
		const fsShimPath = `${runPath}/node-fs.mjs`;
		const fsPromisesShimPath = `${runPath}/node-fs-promises.mjs`;
		const logicalFsRuntimePath = `${runPath}/logical-fs-runtime.mjs`;
		const runnerPath = `${runPath}/runner.mjs`;
		const resultPath = `${runPath}/result.json`;

		await syncFsToVirtualRoot(
			this.fs,
			this.kernel.vfs,
			INTERNAL_MOUNT_PATH
		);
		await this.kernel.writeFile(
			entryPath,
			rewriteNodeFsImports(source, {
				fsPromisesShimPath,
				fsShimPath,
			})
		);
		await this.kernel.writeFile(
			logicalFsRuntimePath,
			buildLogicalFsRuntimeSource()
		);
		await this.kernel.writeFile(
			fsPromisesShimPath,
			buildNodeFsPromisesShimSource(logicalFsRuntimePath)
		);
		await this.kernel.writeFile(
			fsShimPath,
			buildNodeFsShimSource({
				fsPromisesShimPath,
				logicalFsRuntimePath,
			})
		);
		await this.kernel.writeFile(
			runnerPath,
			buildRunnerSource({
				entryPath,
				internalMountPath: INTERNAL_MOUNT_PATH,
				logicalFsRuntimePath,
				logicalCwd: normalizePath(options.cwd ?? this.defaults.cwd),
				resultPath,
			})
		);

		const result = await this.kernel.exec(`node ${runnerPath}`, {
			captureStdio: true,
			cwd: INTERNAL_MOUNT_PATH,
			env: options.env,
			timeout: options.timeoutMs ?? this.defaults.timeoutMs,
		});
		await syncVirtualRootToFs(
			this.kernel.vfs,
			this.fs,
			INTERNAL_MOUNT_PATH
		);
		const value =
			result.exitCode === 0
				? await this.readResult<T>(resultPath)
				: undefined;

		return {
			exitCode: result.exitCode,
			stderr: result.stderr,
			stdout: result.stdout,
			value,
		};
	}

	async dispose(): Promise<void> {
		await this.kernel.dispose();
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose();
	}

	private async readResult<T>(path: string): Promise<T | undefined> {
		if (!(await this.kernel.exists(path))) {
			return undefined;
		}
		const text = new TextDecoder().decode(await this.kernel.readFile(path));
		const parsed = JSON.parse(text) as { value?: T };
		return parsed.value;
	}
}

export async function createCodeMode(
	fs: FS,
	options: CreateCodeModeOptions = {}
): Promise<CodeMode> {
	const rootFilesystem = createInMemoryFileSystem();
	await rootFilesystem.mkdir(INTERNAL_MOUNT_PATH, { recursive: true });
	await rootFilesystem.mkdir(CODE_MODE_TMP_DIR, { recursive: true });

	const kernel = createKernel({
		cwd: INTERNAL_MOUNT_PATH,
		env: options.env,
		filesystem: rootFilesystem,
		onBootTiming: options.onBootTiming,
		permissions: {
			...DEFAULT_PERMISSIONS,
			...options.permissions,
		},
	});

	try {
		const commandDirs = resolveCommandDirs(options.commandsDir);
		await kernel.mount(createWasmVmRuntime({ commandDirs }));
		await kernel.mount(createNodeRuntime());
		return new CodeMode(kernel, fs, {
			cwd: normalizePath(options.cwd ?? DEFAULT_CWD),
			timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		});
	} catch (error) {
		await kernel.dispose();
		throw error;
	}
}

function resolveCommandDirs(commandsDir: string | undefined): string[] {
	if (commandsDir) {
		return [commandsDir];
	}
	const envCommandsDir = process.env.SECURE_EXEC_WASM_COMMANDS_DIR;
	if (envCommandsDir) {
		return [envCommandsDir];
	}
	const packageCommandsDir = resolvePackageCommandsDir();
	return packageCommandsDir ? [packageCommandsDir] : [];
}

function resolvePackageCommandsDir(): string | null {
	try {
		const runtimeUrl = import.meta.resolve(
			'@secure-exec/core/test-runtime'
		);
		const commandsDir = fileURLToPath(new URL('../commands', runtimeUrl));
		return existsSync(commandsDir) ? commandsDir : null;
	} catch {
		return null;
	}
}

async function syncFsToVirtualRoot(
	fs: FS,
	virtualFs: VirtualFileSystem,
	virtualRoot: string
): Promise<void> {
	await clearVirtualDirectory(virtualFs, virtualRoot);
	for await (const childPath of fs.readDirectory('/')) {
		await copyFsEntryToVirtual(fs, virtualFs, childPath, virtualRoot);
	}
}

async function clearVirtualDirectory(
	virtualFs: VirtualFileSystem,
	path: string
): Promise<void> {
	if (!(await virtualFs.exists(path))) {
		await virtualFs.mkdir(path, { recursive: true });
		return;
	}
	const entries = await virtualFs.readDirWithTypes(path);
	for (const entry of entries) {
		const childPath = joinVirtualPath(path, entry.name);
		if (entry.isDirectory && !entry.isSymbolicLink) {
			await clearVirtualDirectory(virtualFs, childPath);
			await virtualFs.removeDir(childPath);
			continue;
		}
		await virtualFs.removeFile(childPath);
	}
}

async function copyFsEntryToVirtual(
	fs: FS,
	virtualFs: VirtualFileSystem,
	sourcePath: string,
	virtualRoot: string
): Promise<void> {
	const targetPath = joinVirtualPath(virtualRoot, sourcePath);
	const symlinkTarget = await readFsSymlinkTarget(fs, sourcePath);
	if (symlinkTarget !== null) {
		await virtualFs.symlink(symlinkTarget, targetPath);
		return;
	}
	const info = await fs.stat(sourcePath);
	if (info.type === 'Directory') {
		await virtualFs.mkdir(targetPath, { recursive: true });
		for await (const childPath of fs.readDirectory(sourcePath)) {
			await copyFsEntryToVirtual(fs, virtualFs, childPath, virtualRoot);
		}
		return;
	}
	await virtualFs.writeFile(targetPath, await fs.readFile(sourcePath));
}

async function syncVirtualRootToFs(
	virtualFs: VirtualFileSystem,
	fs: FS,
	virtualRoot: string
): Promise<void> {
	for await (const childPath of fs.readDirectory('/')) {
		await fs.remove(childPath, { force: true, recursive: true });
	}
	await copyVirtualDirectoryToFs(virtualFs, fs, virtualRoot, '/');
}

async function copyVirtualDirectoryToFs(
	virtualFs: VirtualFileSystem,
	fs: FS,
	virtualPath: string,
	logicalPath: string
): Promise<void> {
	const entries = await virtualFs.readDirWithTypes(virtualPath);
	for (const entry of entries) {
		const childVirtualPath = joinVirtualPath(virtualPath, entry.name);
		const childLogicalPath = joinVirtualPath(logicalPath, entry.name);
		if (entry.isSymbolicLink) {
			await ensureFsParentDirectory(fs, childLogicalPath);
			await fs.symlink(
				await virtualFs.readlink(childVirtualPath),
				childLogicalPath
			);
			continue;
		}
		if (entry.isDirectory) {
			await fs.makeDirectory(childLogicalPath, { recursive: true });
			await copyVirtualDirectoryToFs(
				virtualFs,
				fs,
				childVirtualPath,
				childLogicalPath
			);
			continue;
		}
		await ensureFsParentDirectory(fs, childLogicalPath);
		await fs.writeFile(
			childLogicalPath,
			await virtualFs.readFile(childVirtualPath)
		);
	}
}

async function readFsSymlinkTarget(
	fs: FS,
	path: string
): Promise<string | null> {
	try {
		return await fs.readLink(path);
	} catch (error) {
		if (isFsInvalidOperation(error)) {
			return null;
		}
		throw error;
	}
}

function isFsInvalidOperation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'EINVAL'
	);
}

async function ensureFsParentDirectory(fs: FS, path: string): Promise<void> {
	const parentPath = parentVirtualPath(path);
	if (parentPath === '/') {
		return;
	}
	if (await fs.exists(parentPath)) {
		return;
	}
	await fs.makeDirectory(parentPath, { recursive: true });
}

function parentVirtualPath(path: string): string {
	const normalizedPath = normalizePath(path);
	const lastSlashIndex = normalizedPath.lastIndexOf('/');
	if (lastSlashIndex <= 0) {
		return '/';
	}
	return normalizedPath.slice(0, lastSlashIndex);
}

function joinVirtualPath(parentPath: string, childName: string): string {
	const normalizedParentPath = normalizePath(parentPath);
	const normalizedChildName = childName.replace(LEADING_SLASHES_REGEX, '');
	return normalizePath(
		normalizedParentPath === '/'
			? `/${normalizedChildName}`
			: `${normalizedParentPath}/${normalizedChildName}`
	);
}

function buildRunnerSource(options: {
	readonly entryPath: string;
	readonly internalMountPath: string;
	readonly logicalFsRuntimePath: string;
	readonly logicalCwd: string;
	readonly resultPath: string;
}): string {
	return `
import fs from "node:fs";
import { configureLogicalFs } from ${JSON.stringify(options.logicalFsRuntimePath)};

const internalWriteFileSync = fs.writeFileSync.bind(fs);

configureLogicalFs({
	internalMountPath: ${JSON.stringify(options.internalMountPath)},
	logicalCwd: ${JSON.stringify(options.logicalCwd)},
});

const module = await import(${JSON.stringify(options.entryPath)});
const entry = module.default;
const value = typeof entry === "function" ? await entry() : entry;

internalWriteFileSync(${JSON.stringify(options.resultPath)}, JSON.stringify({ value }));
`;
}

function rewriteNodeFsImports(
	source: string,
	options: {
		readonly fsPromisesShimPath: string;
		readonly fsShimPath: string;
	}
): string {
	let output = source;
	for (const [specifier, replacement] of [
		['node:fs/promises', options.fsPromisesShimPath],
		['fs/promises', options.fsPromisesShimPath],
		['node:fs', options.fsShimPath],
		['fs', options.fsShimPath],
	] as const) {
		output = replaceModuleSpecifier(output, specifier, replacement);
	}
	return output;
}

function replaceModuleSpecifier(
	source: string,
	specifier: string,
	replacement: string
): string {
	const escapedSpecifier = escapeRegex(specifier);
	let output = source;
	for (const quote of ['"', "'", '`']) {
		const escapedQuote = escapeRegex(quote);
		output = output
			.replace(
				new RegExp(
					`(\\bfrom\\s*)${escapedQuote}${escapedSpecifier}${escapedQuote}`,
					'g'
				),
				(_, prefix: string) => `${prefix}${quote}${replacement}${quote}`
			)
			.replace(
				new RegExp(
					`(\\bimport\\s*)${escapedQuote}${escapedSpecifier}${escapedQuote}`,
					'g'
				),
				(_, prefix: string) => `${prefix}${quote}${replacement}${quote}`
			)
			.replace(
				new RegExp(
					`(\\bimport\\s*\\(\\s*)${escapedQuote}${escapedSpecifier}${escapedQuote}(\\s*\\))`,
					'g'
				),
				(_, prefix: string, suffix: string) =>
					`${prefix}${quote}${replacement}${quote}${suffix}`
			);
	}
	return output;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLogicalFsRuntimeSource(): string {
	return `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

let internalMountPath = "/workspace";
let logicalCwd = "/";
const internalStatSync = fs.statSync.bind(fs);

export function configureLogicalFs(options) {
	internalMountPath = options.internalMountPath;
	logicalCwd = normalizeLogicalPath(options.logicalCwd ?? "/");
	process.cwd = () => logicalCwd;
	process.chdir = (targetPath) => {
		const nextCwd = normalizeLogicalPath(targetPath);
		const stat = internalStatSync(toInternalPath(nextCwd));
		if (!stat.isDirectory()) {
			throw Object.assign(new Error(\`ENOTDIR: not a directory, chdir '\${logicalCwd}' -> '\${nextCwd}'\`), {
				code: "ENOTDIR",
				errno: -20,
				path: nextCwd,
				syscall: "chdir",
			});
		}
		logicalCwd = nextCwd;
	};
	patchOriginalFs();
	syncBuiltinESMExports();
}

export function isPathLike(value) {
	return typeof value === "string" || Buffer.isBuffer(value) || value instanceof URL;
}

export function normalizeLogicalPath(value) {
	const rawPath = value instanceof URL ? fileURLToPath(value) : String(value);
	return path.posix.isAbsolute(rawPath)
		? path.posix.resolve("/", rawPath)
		: path.posix.resolve("/", logicalCwd, rawPath);
}

export function toInternalPath(value) {
	if (!isPathLike(value)) {
		return value;
	}
	const logicalPath = normalizeLogicalPath(value);
	const internalPath = logicalPath === "/" ? "." : logicalPath.slice(1);
	return Buffer.isBuffer(value) ? Buffer.from(internalPath) : internalPath;
}

export function fromInternalPath(value) {
	if (typeof value !== "string") {
		return value;
	}
	if (value === internalMountPath) {
		return "/";
	}
	if (value.startsWith(\`\${internalMountPath}/\`)) {
		return value.slice(internalMountPath.length);
	}
	if (!path.posix.isAbsolute(value)) {
		return normalizeLogicalPath(value);
	}
	return value;
}

export function rewriteError(error) {
	if (!error || typeof error !== "object") {
		return error;
	}
	for (const key of ["message", "path", "dest"]) {
		if (typeof error[key] === "string") {
			error[key] = fromInternalPath(error[key]);
		}
	}
	if (typeof error.stack === "string") {
		error.stack = error.stack.replaceAll(internalMountPath, "");
	}
	return error;
}

export function mapRealpathResult(value) {
	if (Buffer.isBuffer(value)) {
		return Buffer.from(fromInternalPath(value.toString()));
	}
	return fromInternalPath(value);
}

export function wrapSync(fn, pathIndexes, options = {}) {
	return (...args) => {
		try {
			const nextArgs = [...args];
			for (const index of pathIndexes) {
				if (isPathLike(nextArgs[index])) {
					nextArgs[index] = toInternalPath(nextArgs[index]);
				}
			}
			const result = fn(...nextArgs);
			return options.mapResult ? options.mapResult(result) : result;
		} catch (error) {
			throw rewriteError(error);
		}
	};
}

export function wrapAsync(fn, pathIndexes, options = {}) {
	return async (...args) => {
		try {
			const nextArgs = [...args];
			for (const index of pathIndexes) {
				if (isPathLike(nextArgs[index])) {
					nextArgs[index] = toInternalPath(nextArgs[index]);
				}
			}
			const result = await fn(...nextArgs);
			return options.mapResult ? options.mapResult(result) : result;
		} catch (error) {
			throw rewriteError(error);
		}
	};
}

export function wrapCallback(fn, pathIndexes, options = {}) {
	return (...args) => {
		const nextArgs = [...args];
		const callback = nextArgs.at(-1);
		if (typeof callback === "function") {
			nextArgs[nextArgs.length - 1] = (error, ...values) => {
				if (error) {
					callback(rewriteError(error), ...values);
					return;
				}
				callback(null, ...(options.mapValues ? options.mapValues(values) : values));
			};
		}
		try {
			for (const index of pathIndexes) {
				if (isPathLike(nextArgs[index])) {
					nextArgs[index] = toInternalPath(nextArgs[index]);
				}
			}
			return fn(...nextArgs);
		} catch (error) {
			throw rewriteError(error);
		}
	};
}

function patchOriginalFs() {
	const syncPaths = {
		accessSync: [0],
		appendFileSync: [0],
		chmodSync: [0],
		chownSync: [0],
		copyFileSync: [0, 1],
		cpSync: [0, 1],
		existsSync: [0],
		lchmodSync: [0],
		lchownSync: [0],
		linkSync: [0, 1],
		lstatSync: [0],
		lutimesSync: [0],
		mkdirSync: [0],
		mkdtempSync: [0],
		openSync: [0],
		opendirSync: [0],
		readFileSync: [0],
		readdirSync: [0],
		readlinkSync: [0],
		realpathSync: [0],
		renameSync: [0, 1],
		rmSync: [0],
		rmdirSync: [0],
		statSync: [0],
		symlinkSync: [1],
		truncateSync: [0],
		unlinkSync: [0],
		utimesSync: [0],
		writeFileSync: [0],
	};
	const callbackPaths = {
		access: [0],
		appendFile: [0],
		chmod: [0],
		chown: [0],
		copyFile: [0, 1],
		cp: [0, 1],
		lchmod: [0],
		lchown: [0],
		link: [0, 1],
		lstat: [0],
		lutimes: [0],
		mkdir: [0],
		mkdtemp: [0],
		open: [0],
		opendir: [0],
		readFile: [0],
		readdir: [0],
		readlink: [0],
		realpath: [0],
		rename: [0, 1],
		rm: [0],
		rmdir: [0],
		stat: [0],
		symlink: [1],
		truncate: [0],
		unlink: [0],
		utimes: [0],
		writeFile: [0],
	};
	for (const [name, indexes] of Object.entries(syncPaths)) {
		if (typeof fs[name] === "function") {
			fs[name] = wrapSync(fs[name].bind(fs), indexes, name === "realpathSync" || name === "mkdtempSync" ? { mapResult: mapRealpathResult } : {});
		}
	}
	for (const [name, indexes] of Object.entries(callbackPaths)) {
		if (typeof fs[name] === "function") {
			fs[name] = wrapCallback(fs[name].bind(fs), indexes, name === "realpath" || name === "mkdtemp" ? { mapValues: (values) => values.map(mapRealpathResult) } : {});
		}
		const promiseFn = fs.promises?.[name];
		if (typeof promiseFn === "function") {
			fs.promises[name] = wrapAsync(promiseFn.bind(fs.promises), indexes, name === "realpath" || name === "mkdtemp" ? { mapResult: mapRealpathResult } : {});
		}
	}
	fs.createReadStream = wrapSync(fs.createReadStream.bind(fs), [0]);
	fs.createWriteStream = wrapSync(fs.createWriteStream.bind(fs), [0]);
	fs.watch = wrapSync(fs.watch.bind(fs), [0]);
	fs.watchFile = wrapSync(fs.watchFile.bind(fs), [0]);
	fs.unwatchFile = wrapSync(fs.unwatchFile.bind(fs), [0]);
}
`;
}

function buildNodeFsPromisesShimSource(runtimePath: string): string {
	return `
import original from "node:fs/promises";
export * from "node:fs/promises";
import { mapRealpathResult, wrapAsync } from ${JSON.stringify(runtimePath)};

export const access = wrapAsync(original.access.bind(original), [0]);
export const appendFile = wrapAsync(original.appendFile.bind(original), [0]);
export const chmod = wrapAsync(original.chmod.bind(original), [0]);
export const chown = wrapAsync(original.chown.bind(original), [0]);
export const copyFile = wrapAsync(original.copyFile.bind(original), [0, 1]);
export const cp = wrapAsync(original.cp.bind(original), [0, 1]);
export const link = wrapAsync(original.link.bind(original), [0, 1]);
export const lstat = wrapAsync(original.lstat.bind(original), [0]);
export const lutimes = wrapAsync(original.lutimes.bind(original), [0]);
export const mkdir = wrapAsync(original.mkdir.bind(original), [0]);
export const mkdtemp = wrapAsync(original.mkdtemp.bind(original), [0], { mapResult: mapRealpathResult });
export const open = wrapAsync(original.open.bind(original), [0]);
export const opendir = wrapAsync(original.opendir.bind(original), [0]);
export const readFile = wrapAsync(original.readFile.bind(original), [0]);
export const readdir = wrapAsync(original.readdir.bind(original), [0]);
export const readlink = wrapAsync(original.readlink.bind(original), [0]);
export const realpath = wrapAsync(original.realpath.bind(original), [0], { mapResult: mapRealpathResult });
export const rename = wrapAsync(original.rename.bind(original), [0, 1]);
export const rm = wrapAsync(original.rm.bind(original), [0]);
export const rmdir = wrapAsync(original.rmdir.bind(original), [0]);
export const stat = wrapAsync(original.stat.bind(original), [0]);
export const symlink = wrapAsync(original.symlink.bind(original), [1]);
export const truncate = wrapAsync(original.truncate.bind(original), [0]);
export const unlink = wrapAsync(original.unlink.bind(original), [0]);
export const utimes = wrapAsync(original.utimes.bind(original), [0]);
export const writeFile = wrapAsync(original.writeFile.bind(original), [0]);

const logicalPromises = {
	...original,
	access,
	appendFile,
	chmod,
	chown,
	copyFile,
	cp,
	link,
	lstat,
	lutimes,
	mkdir,
	mkdtemp,
	open,
	opendir,
	readFile,
	readdir,
	readlink,
	realpath,
	rename,
	rm,
	rmdir,
	stat,
	symlink,
	truncate,
	unlink,
	utimes,
	writeFile,
};

export default logicalPromises;
`;
}

function buildNodeFsShimSource(options: {
	readonly fsPromisesShimPath: string;
	readonly logicalFsRuntimePath: string;
}): string {
	return `
import original from "node:fs";
export * from "node:fs";
import logicalPromises from ${JSON.stringify(options.fsPromisesShimPath)};
import { mapRealpathResult, rewriteError, toInternalPath, wrapCallback, wrapSync } from ${JSON.stringify(options.logicalFsRuntimePath)};

export const accessSync = wrapSync(original.accessSync.bind(original), [0]);
export const appendFileSync = wrapSync(original.appendFileSync.bind(original), [0]);
export const chmodSync = wrapSync(original.chmodSync.bind(original), [0]);
export const chownSync = wrapSync(original.chownSync.bind(original), [0]);
export const closeSync = original.closeSync.bind(original);
export const copyFileSync = wrapSync(original.copyFileSync.bind(original), [0, 1]);
export const cpSync = wrapSync(original.cpSync.bind(original), [0, 1]);
export const existsSync = wrapSync(original.existsSync.bind(original), [0]);
export const lchmodSync = typeof original.lchmodSync === "function" ? wrapSync(original.lchmodSync.bind(original), [0]) : undefined;
export const lchownSync = typeof original.lchownSync === "function" ? wrapSync(original.lchownSync.bind(original), [0]) : undefined;
export const linkSync = wrapSync(original.linkSync.bind(original), [0, 1]);
export const lstatSync = wrapSync(original.lstatSync.bind(original), [0]);
export const lutimesSync = wrapSync(original.lutimesSync.bind(original), [0]);
export const mkdirSync = wrapSync(original.mkdirSync.bind(original), [0]);
export const mkdtempSync = wrapSync(original.mkdtempSync.bind(original), [0], { mapResult: mapRealpathResult });
export const openSync = wrapSync(original.openSync.bind(original), [0]);
export const opendirSync = wrapSync(original.opendirSync.bind(original), [0]);
export const readFileSync = wrapSync(original.readFileSync.bind(original), [0]);
export const readdirSync = wrapSync(original.readdirSync.bind(original), [0]);
export const readlinkSync = wrapSync(original.readlinkSync.bind(original), [0]);
export const realpathSync = wrapSync(original.realpathSync.bind(original), [0], { mapResult: mapRealpathResult });
export const renameSync = wrapSync(original.renameSync.bind(original), [0, 1]);
export const rmSync = wrapSync(original.rmSync.bind(original), [0]);
export const rmdirSync = wrapSync(original.rmdirSync.bind(original), [0]);
export const statSync = wrapSync(original.statSync.bind(original), [0]);
export const symlinkSync = wrapSync(original.symlinkSync.bind(original), [1]);
export const truncateSync = wrapSync(original.truncateSync.bind(original), [0]);
export const unlinkSync = wrapSync(original.unlinkSync.bind(original), [0]);
export const utimesSync = wrapSync(original.utimesSync.bind(original), [0]);
export const writeFileSync = wrapSync(original.writeFileSync.bind(original), [0]);

export const access = wrapCallback(original.access.bind(original), [0]);
export const appendFile = wrapCallback(original.appendFile.bind(original), [0]);
export const chmod = wrapCallback(original.chmod.bind(original), [0]);
export const chown = wrapCallback(original.chown.bind(original), [0]);
export const copyFile = wrapCallback(original.copyFile.bind(original), [0, 1]);
export const cp = wrapCallback(original.cp.bind(original), [0, 1]);
export const exists = (targetPath, callback) => {
	try {
		return original.exists(toInternalPath(targetPath), callback);
	} catch (error) {
		throw rewriteError(error);
	}
};
export const lchmod = typeof original.lchmod === "function" ? wrapCallback(original.lchmod.bind(original), [0]) : undefined;
export const lchown = typeof original.lchown === "function" ? wrapCallback(original.lchown.bind(original), [0]) : undefined;
export const link = wrapCallback(original.link.bind(original), [0, 1]);
export const lstat = wrapCallback(original.lstat.bind(original), [0]);
export const lutimes = wrapCallback(original.lutimes.bind(original), [0]);
export const mkdir = wrapCallback(original.mkdir.bind(original), [0]);
export const mkdtemp = wrapCallback(original.mkdtemp.bind(original), [0], { mapValues: (values) => values.map(mapRealpathResult) });
export const open = wrapCallback(original.open.bind(original), [0]);
export const opendir = wrapCallback(original.opendir.bind(original), [0]);
export const readFile = wrapCallback(original.readFile.bind(original), [0]);
export const readdir = wrapCallback(original.readdir.bind(original), [0]);
export const readlink = wrapCallback(original.readlink.bind(original), [0]);
export const realpath = wrapCallback(original.realpath.bind(original), [0], { mapValues: (values) => values.map(mapRealpathResult) });
export const rename = wrapCallback(original.rename.bind(original), [0, 1]);
export const rm = wrapCallback(original.rm.bind(original), [0]);
export const rmdir = wrapCallback(original.rmdir.bind(original), [0]);
export const stat = wrapCallback(original.stat.bind(original), [0]);
export const symlink = wrapCallback(original.symlink.bind(original), [1]);
export const truncate = wrapCallback(original.truncate.bind(original), [0]);
export const unlink = wrapCallback(original.unlink.bind(original), [0]);
export const utimes = wrapCallback(original.utimes.bind(original), [0]);
export const writeFile = wrapCallback(original.writeFile.bind(original), [0]);

export const createReadStream = wrapSync(original.createReadStream.bind(original), [0]);
export const createWriteStream = wrapSync(original.createWriteStream.bind(original), [0]);
export const watch = wrapSync(original.watch.bind(original), [0]);
export const watchFile = wrapSync(original.watchFile.bind(original), [0]);
export const unwatchFile = wrapSync(original.unwatchFile.bind(original), [0]);
export const promises = logicalPromises;

const logicalFs = {
	...original,
	access,
	accessSync,
	appendFile,
	appendFileSync,
	chmod,
	chmodSync,
	chown,
	chownSync,
	copyFile,
	copyFileSync,
	cp,
	cpSync,
	createReadStream,
	createWriteStream,
	exists,
	existsSync,
	link,
	linkSync,
	lstat,
	lstatSync,
	lutimes,
	lutimesSync,
	mkdir,
	mkdirSync,
	mkdtemp,
	mkdtempSync,
	open,
	openSync,
	opendir,
	opendirSync,
	promises,
	readFile,
	readFileSync,
	readdir,
	readdirSync,
	readlink,
	readlinkSync,
	realpath,
	realpathSync,
	rename,
	renameSync,
	rm,
	rmSync,
	rmdir,
	rmdirSync,
	stat,
	statSync,
	symlink,
	symlinkSync,
	truncate,
	truncateSync,
	unlink,
	unlinkSync,
	utimes,
	utimesSync,
	watch,
	watchFile,
	writeFile,
	writeFileSync,
};

if (lchmod) {
	logicalFs.lchmod = lchmod;
}
if (lchmodSync) {
	logicalFs.lchmodSync = lchmodSync;
}
if (lchown) {
	logicalFs.lchown = lchown;
}
if (lchownSync) {
	logicalFs.lchownSync = lchownSync;
}

export default logicalFs;
`;
}
