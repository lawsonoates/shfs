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
	type VirtualDirEntry,
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

import { type FS, InvalidOperationError } from '../fs';
import { normalizePath } from '../util/path';

const DEFAULT_TIMEOUT_MS = 5000;
// Per-run entry/runner/result files. Outside fs.home, so never synced.
const RUN_DIR = '/tmp/shfs-code-mode';

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
	private readonly readOnly: boolean;
	private runId = 0;

	constructor(
		kernel: Kernel,
		fs: FS,
		defaults: { cwd: string; timeoutMs: number },
		readOnly: boolean
	) {
		this.kernel = kernel;
		this.fs = fs;
		this.defaults = defaults;
		this.readOnly = readOnly;
	}

	async exec<T = unknown>(
		source: string,
		options: CodeModeExecOptions = {}
	): Promise<CodeModeResult<T>> {
		if ((options.language ?? 'ts') === 'js') {
			return await this.run<T>(source, options);
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
		return await this.run<T>(transpiled.outputText, options);
	}

	private async run<T = unknown>(
		source: string,
		options: CodeModeExecOptions = {}
	): Promise<CodeModeResult<T>> {
		const dir = `${RUN_DIR}/${Date.now().toString(36)}-${this.runId}`;
		this.runId += 1;
		const entry = `${dir}/entry.mjs`;
		const output = `${dir}/result.json`;

		await load(this.fs, this.kernel.vfs);
		await this.kernel.writeFile(entry, source);
		await this.kernel.writeFile(`${dir}/runner.mjs`, runner(entry, output));

		const result = await this.kernel.exec(`node ${dir}/runner.mjs`, {
			captureStdio: true,
			cwd: normalizePath(options.cwd ?? this.defaults.cwd),
			env: options.env,
			timeout: options.timeoutMs ?? this.defaults.timeoutMs,
		});
		if (!this.readOnly) {
			await save(this.kernel.vfs, this.fs);
		}
		const value =
			result.exitCode === 0 ? await this.value<T>(output) : undefined;

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

	private async value<T>(path: string): Promise<T | undefined> {
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
	if (normalizePath(fs.home) === '/') {
		throw new Error(
			"code mode requires fs.home to be a directory below '/'; " +
				"construct the filesystem with a home, e.g. new MemoryFS({ home: '/home/user' })"
		);
	}
	await fs.makeDirectory(fs.home, { recursive: true });

	const root = createInMemoryFileSystem();
	await root.mkdir(fs.home, { recursive: true });
	await root.mkdir(RUN_DIR, { recursive: true });

	const kernel = createKernel({
		cwd: normalizePath(options.cwd ?? fs.home),
		env: { HOME: fs.home, ...options.env },
		filesystem: root,
		onBootTiming: options.onBootTiming,
		permissions: {
			...DEFAULT_PERMISSIONS,
			...options.permissions,
		},
		// save() owns persistence; the kernel's dispose-time sync is redundant.
		syncFilesystemOnDispose: false,
	});

	try {
		await kernel.mount(
			createWasmVmRuntime({
				commandDirs: resolveCommandDirs(options.commandsDir),
			})
		);
		await kernel.mount(createNodeRuntime());
		return new CodeMode(
			kernel,
			fs,
			{
				cwd: normalizePath(options.cwd ?? fs.home),
				timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			},
			options.readOnly ?? false
		);
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

/** Replaces the guest's fs.home contents with the current shfs contents. */
async function load(fs: FS, vfs: VirtualFileSystem): Promise<void> {
	for (const entry of await vfs.readDirWithTypes(fs.home)) {
		await wipe(vfs, join(fs.home, entry.name), entry);
	}
	for await (const child of fs.readDirectory(fs.home)) {
		await copyIn(fs, vfs, child);
	}
}

/** Replaces the shfs fs.home contents with the guest's. */
async function save(vfs: VirtualFileSystem, fs: FS): Promise<void> {
	for await (const child of fs.readDirectory(fs.home)) {
		await fs.remove(child, { force: true, recursive: true });
	}
	for (const entry of await vfs.readDirWithTypes(fs.home)) {
		await copyOut(vfs, fs, join(fs.home, entry.name), entry);
	}
}

async function wipe(
	vfs: VirtualFileSystem,
	path: string,
	entry: VirtualDirEntry
): Promise<void> {
	if (entry.isDirectory && !entry.isSymbolicLink) {
		for (const child of await vfs.readDirWithTypes(path)) {
			await wipe(vfs, join(path, child.name), child);
		}
		await vfs.removeDir(path);
		return;
	}
	await vfs.removeFile(path);
}

async function copyIn(
	fs: FS,
	vfs: VirtualFileSystem,
	path: string
): Promise<void> {
	const link = await target(fs, path);
	if (link !== null) {
		await vfs.symlink(link, path);
		return;
	}
	const info = await fs.stat(path);
	if (info.type === 'Directory') {
		await vfs.mkdir(path, { recursive: true });
		for await (const child of fs.readDirectory(path)) {
			await copyIn(fs, vfs, child);
		}
		return;
	}
	await vfs.writeFile(path, await fs.readFile(path));
}

async function copyOut(
	vfs: VirtualFileSystem,
	fs: FS,
	path: string,
	entry: VirtualDirEntry
): Promise<void> {
	if (entry.isSymbolicLink) {
		await fs.symlink(await vfs.readlink(path), path);
		return;
	}
	if (entry.isDirectory) {
		await fs.makeDirectory(path, { recursive: true });
		for (const child of await vfs.readDirWithTypes(path)) {
			await copyOut(vfs, fs, join(path, child.name), child);
		}
		return;
	}
	await fs.writeFile(path, await vfs.readFile(path));
}

async function target(fs: FS, path: string): Promise<string | null> {
	try {
		return await fs.readLink(path);
	} catch (error) {
		if (error instanceof InvalidOperationError) {
			return null;
		}
		throw error;
	}
}

function join(dir: string, child: string): string {
	return normalizePath(dir === '/' ? `/${child}` : `${dir}/${child}`);
}

function runner(entry: string, output: string): string {
	return `
// Resolve the guest fs object the way the builtin module asset does, WITHOUT
// importing node:fs: the asset snapshots its named exports on first import,
// so patching before any import makes named imports see the patch too.
const fs = globalThis.__agentOSBuiltinFs ?? globalThis.__agentOSGuestFs ?? process.getBuiltinModule?.("node:fs");
if (!fs) {
	throw new Error("code mode could not resolve the guest node:fs module");
}

// The secure-exec node emulation ignores readdir's recursive option; walk
// manually. Recursive callers get names, matching Node's default output.
const sync = fs.readdirSync.bind(fs);
const callback = fs.readdir.bind(fs);
const promise = fs.promises.readdir.bind(fs.promises);
const join = (dir, name) => (dir.endsWith("/") ? dir + name : dir + "/" + name);
const recursive = (options) => typeof options === "object" && options !== null && options.recursive === true;
const buffered = (options) => options === "buffer" || options?.encoding === "buffer";
const label = (rel, options) => (buffered(options) ? Buffer.from(rel) : rel);
const walkSync = (dir, prefix, options) =>
	sync(dir, { encoding: "utf8", withFileTypes: true }).flatMap((child) => {
		const rel = prefix ? join(prefix, child.name) : child.name;
		return child.isDirectory()
			? [label(rel, options), ...walkSync(join(dir, child.name), rel, options)]
			: [label(rel, options)];
	});
const walk = async (dir, prefix, options) => {
	const children = await promise(dir, { encoding: "utf8", withFileTypes: true });
	const names = [];
	for (const child of children) {
		const rel = prefix ? join(prefix, child.name) : child.name;
		names.push(label(rel, options));
		if (child.isDirectory()) {
			names.push(...(await walk(join(dir, child.name), rel, options)));
		}
	}
	return names;
};
fs.readdirSync = (dir, options) => (recursive(options) ? walkSync(dir, "", options) : sync(dir, options));
fs.promises.readdir = (dir, options) => (recursive(options) ? walk(dir, "", options) : promise(dir, options));
fs.readdir = (dir, options, done) => {
	if (typeof options === "function") {
		return callback(dir, options);
	}
	if (!recursive(options)) {
		return callback(dir, options, done);
	}
	walk(dir, "", options).then((names) => done(null, names), (error) => done(error));
};

const module = await import(${JSON.stringify(entry)});
const value = typeof module.default === "function" ? await module.default() : module.default;
fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify({ value }));
`;
}
