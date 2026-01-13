import { AgentFS } from 'agentfs-sdk';
import type { FS } from 'shfs/fs';

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

	async deleteFile(path: string): Promise<void> {
		await this.agent.fs.deleteFile(path);
	}

	async *readdir(path: string): AsyncIterable<string> {
		const files = await this.agent.fs.readdir(path);
		for (const file of files) {
			yield file;
		}
	}

	async mkdir(path: string, recursive = false): Promise<void> {
		if (recursive) {
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

	async stat(
		path: string
	): Promise<{ isDirectory: boolean; size: number; mtime: Date }> {
		const stats = await this.agent.fs.stat(path);
		return {
			isDirectory: stats.isDirectory(),
			size: stats.size,
			mtime: new Date(stats.mtime * 1000),
		};
	}

	async exists(path: string): Promise<boolean> {
		const stats = await this.agent.fs.stat(path);
		if (stats.isDirectory()) {
			return true;
		}
		if (stats.isFile()) {
			return true;
		}

		return false;
	}
}
