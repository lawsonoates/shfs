import { AgentFS } from 'agentfs-sdk';
import type { FS, FsInfo } from 'shfs/fs';
import { normalizePath } from 'shfs/util/path';

export class TursoAgentFS implements FS {
	private readonly agent: AgentFS;

	private constructor(agent: AgentFS) {
		this.agent = agent;
	}

	static async create(id: string): Promise<TursoAgentFS> {
		const agent = await AgentFS.open({ id });
		return new TursoAgentFS(agent);
	}

	async readFile(path: string): Promise<Uint8Array> {
		const content = await this.agent.fs.readFile(path);
		if (typeof content === 'string') {
			return new TextEncoder().encode(content);
		}
		return new Uint8Array(content);
	}

	async *readLines(path: string): AsyncIterable<string> {
		const content = await this.readFile(path);
		const text = new TextDecoder().decode(content);
		const lines = text
			.split('\n')
			.filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''));
		yield* lines;
	}

	async writeFile(path: string, content: Uint8Array): Promise<void> {
		const buffer = Buffer.from(content);
		await this.agent.fs.writeFile(path, buffer);
	}

	async rename(src: string, dest: string): Promise<void> {
		await this.agent.fs.rename(src, dest);
	}

	async remove(
		path: string,
		options?: { recursive?: boolean; force?: boolean }
	): Promise<void> {
		const recursive = options?.recursive ?? false;
		const force = options?.force ?? false;
		try {
			const stats = await this.agent.fs.stat(path);
			if (stats.isDirectory()) {
				if (recursive) {
					await this.agent.fs.rm(path, { recursive: true });
				} else {
					await this.agent.fs.rmdir(path);
				}
				return;
			}
			await this.agent.fs.deleteFile(path);
		} catch (error) {
			if (force) {
				return;
			}
			throw error;
		}
	}

	async *readDirectory(
		path: string,
		_options?: { recursive?: boolean }
	): AsyncIterable<string> {
		const normalizedDirectoryPath = normalizePath(path);
		const entries = await this.agent.fs.readdir(path);
		for (const entry of entries) {
			const absolutePath = entry.startsWith('/')
				? normalizePath(entry)
				: normalizePath(`${normalizedDirectoryPath}/${entry}`);
			yield absolutePath;
		}
	}

	async makeDirectory(
		path: string,
		options?: { recursive?: boolean; mode?: number }
	): Promise<void> {
		if (options?.recursive) {
			// Create all parent directories
			const parts = path.split('/').filter(Boolean);
			let current = '';
			for (const part of parts) {
				current += `/${part}`;
				try {
					await this.agent.fs.mkdir(current);
				} catch {
					// Directory might already exist, continue
				}
			}
		} else {
			await this.agent.fs.mkdir(path);
		}
	}

	async stat(path: string): Promise<FsInfo> {
		const stats = await this.agent.fs.stat(path);
		let type: FsInfo['type'] = 'Unknown';
		if (stats.isDirectory()) {
			type = 'Directory';
		} else if (stats.isFile()) {
			type = 'File';
		}
		return {
			type,
			size: stats.size,
			mode: type === 'Directory' ? 0o755 : 0o644,
			mtime: new Date(stats.mtime * 1000),
		};
	}

	async exists(path: string): Promise<boolean> {
		try {
			const stats = await this.agent.fs.stat(path);
			if (stats.isDirectory()) {
				return true;
			}
			if (stats.isFile()) {
				return true;
			}
			return false;
		} catch {
			// Treat any stat failure as "does not exist" for this adapter.
			// This mirrors MemoryFS.exists behavior used by shfs.
			return false;
		}
	}

	// Symlinks are not supported by this backing store. See notes/symlink-support.md.
	async readLink(path: string): Promise<string> {
		throw new Error(`readLink is not supported: ${path}`);
	}

	async realPath(path: string): Promise<string> {
		return normalizePath(path);
	}

	async symlink(target: string, path: string): Promise<void> {
		throw new Error(`symlink is not supported: ${target} -> ${path}`);
	}
}
