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

test.skipIf(!runSecureExecIntegration)(
	'code mode runs TypeScript that uses node:fs/promises against shfs',
	async () => {
		const { createCodeMode } = await import('#shfs/code-mode/index');
		const fs = new MemoryFS();
		fs.setFile('/README.md', '# shfs');
		fs.setFile('/src/index.ts', 'export const value = 1;');

		const codeMode = await createCodeMode(fs);
		try {
			const result = await codeMode.exec<{
				files: string[];
				readme: string;
			}>(`
import { readFile, readdir, writeFile } from "node:fs/promises";

export default async function main() {
	const files = await readdir("/");
	const readme = await readFile("/README.md", "utf8");
	await writeFile("/summary.json", JSON.stringify({ files, readme, cwd: process.cwd() }));
	return { files, readme, cwd: process.cwd() };
}
`);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe('');
			expect(result.value).toEqual({
				cwd: '/',
				files: ['README.md', 'src'],
				readme: '# shfs',
			});
			expect(
				new TextDecoder().decode(await fs.readFile('/summary.json'))
			).toBe('{"files":["README.md","src"],"readme":"# shfs","cwd":"/"}');
		} finally {
			await codeMode.dispose();
		}
	},
	30_000
);
