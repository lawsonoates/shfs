import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';

import { MemoryFS } from '#shfs/fs/memory';

const secureExecAvailable =
	existsSync(
		new URL(
			'../../../node_modules/@secure-exec/core/package.json',
			import.meta.url
		)
	) ||
	existsSync(
		new URL(
			'../../../packages/shfs/node_modules/@secure-exec/core/package.json',
			import.meta.url
		)
	);
const runSecureExecIntegration =
	secureExecAvailable && process.env.SHFS_RUN_SECURE_EXEC_TESTS === '1';

async function names(fs: MemoryFS, path: string): Promise<string[]> {
	const output: string[] = [];
	for await (const child of fs.readDirectory(path)) {
		output.push(child);
	}
	return output.sort();
}

test.skipIf(!runSecureExecIntegration)(
	'code mode rejects a filesystem whose home is the root',
	async () => {
		const { createCodeMode } = await import('#shfs/code-mode/index');
		expect(createCodeMode(new MemoryFS())).rejects.toThrow(
			"code mode requires fs.home to be a directory below '/'"
		);
	}
);

test.skipIf(!runSecureExecIntegration)(
	'code mode runs TypeScript that uses node:fs/promises against fs.home',
	async () => {
		const { createCodeMode } = await import('#shfs/code-mode/index');
		const fs = new MemoryFS({ home: '/home/user' });
		fs.setFile('/home/user/README.md', '# shfs');
		fs.setFile('/home/user/src/index.ts', 'export const value = 1;');
		fs.setFile('/home/user/src/nested/needle.txt', 'needle');

		const codeMode = await createCodeMode(fs);
		try {
			const result = await codeMode.exec<{
				cwd: string;
				files: string[];
				readme: string;
				recursiveFiles: string[];
				relative: string;
				syncRecursiveFiles: string[];
			}>(`
import { readdirSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";

export default async function main() {
	const files = (await readdir("/home/user")).sort();
	const recursiveFiles = (await readdir("/home/user/src", { recursive: true })).sort();
	// Named node:fs imports work because the runner patches the guest fs
	// object before any node:fs import is evaluated.
	const syncRecursiveFiles = readdirSync("src", { recursive: true }).sort();
	const readme = await readFile("/home/user/README.md", "utf8");
	const relative = await readFile("README.md", "utf8");
	await writeFile("summary.json", JSON.stringify({ files, readme }));
	return { files, readme, recursiveFiles, relative, syncRecursiveFiles, cwd: process.cwd() };
}
`);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe('');
			expect(result.value).toEqual({
				cwd: '/home/user',
				files: ['README.md', 'src'],
				readme: '# shfs',
				recursiveFiles: ['index.ts', 'nested', 'nested/needle.txt'],
				relative: '# shfs',
				syncRecursiveFiles: ['index.ts', 'nested', 'nested/needle.txt'],
			});
			expect(
				new TextDecoder().decode(
					await fs.readFile('/home/user/summary.json')
				)
			).toBe('{"files":["README.md","src"],"readme":"# shfs"}');
			// Guest writes flow back; sandbox scaffolding does not.
			expect(await names(fs, '/home/user')).toEqual([
				'/home/user/README.md',
				'/home/user/src',
				'/home/user/summary.json',
			]);
			expect(await names(fs, '/')).toEqual(['/home']);
		} finally {
			await codeMode.dispose();
		}
	},
	30_000
);

test.skipIf(!runSecureExecIntegration)(
	'read-only code mode does not persist guest writes',
	async () => {
		const { createCodeMode } = await import('#shfs/code-mode/index');
		const fs = new MemoryFS({ home: '/home/user' });
		fs.setFile('/home/user/README.md', '# shfs');

		const codeMode = await createCodeMode(fs, { readOnly: true });
		try {
			const result = await codeMode.exec<string>(`
import { readFile, writeFile } from "node:fs/promises";

export default async function main() {
	await writeFile("scratch.txt", "guest only");
	return await readFile("README.md", "utf8");
}
`);

			expect(result.exitCode).toBe(0);
			expect(result.value).toBe('# shfs');
			expect(await names(fs, '/home/user')).toEqual([
				'/home/user/README.md',
			]);
		} finally {
			await codeMode.dispose();
		}
	},
	30_000
);
