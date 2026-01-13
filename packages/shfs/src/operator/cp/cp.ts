import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

// export function cp(fs: FS, dest: string): Sink<FileRecord, void> {
// 	return async (input) => {
// 		for await (const record of input) {
// 			const content = await fs.readFile(record.path);
// 			await fs.writeFile(dest, content);
// 		}
// 	};
// }

// export function cp(fs: FS): Effect<{ srcs: string[]; dest: string }> {
// 	return async ({ srcs, dest }) => {
// 		await Promise.all(
// 			srcs.map(async (src) => {
// 				const content = await fs.readFile(src);
// 				await fs.writeFile(dest, content);
// 			})
// 		);
// 	};
// }

// missing recursive ?

export function cp(
	fs: FS
): Effect<{ src: string; dest: string; recursive: boolean }> {
	return async ({ src, dest }) => {
		const content = await fs.readFile(src);
		await fs.writeFile(dest, content);
	};
}
