import type { FS } from '../../fs/fs';
import type { Effect } from '../types';

const MULTIPLE_SLASH_REGEX = /\/+/g;

function extractFileName(path: string): string {
	const lastSlashIndex = path.lastIndexOf('/');
	if (lastSlashIndex === -1) {
		return path;
	}
	return path.slice(lastSlashIndex + 1);
}

export function mv(fs: FS): Effect<{ srcs: string[]; dest: string }> {
	return async ({ srcs, dest }) => {
		if (srcs.length === 1) {
			const src = srcs[0];
			if (src === undefined) {
				throw new Error('Source path is required');
			}
			// Check if dest is a directory
			try {
				const destStat = await fs.stat(dest);
				if (destStat.isDirectory) {
					// Move file into directory
					const fileName = extractFileName(src);
					const newPath = `${dest}/${fileName}`.replace(
						MULTIPLE_SLASH_REGEX,
						'/'
					);
					await moveFile(fs, src, newPath);
				} else {
					// Dest is a file, throw error
					throw new Error(`Destination file already exists: ${dest}`);
				}
			} catch (error) {
				// Check if error is about existing file
				if ((error as Error).message.includes('already exists')) {
					throw error;
				}
				// Dest doesn't exist, move src to dest
				await moveFile(fs, src, dest);
			}
		} else {
			// If multiple sources, dest must be a directory
			// and each source is moved into that directory
			for (const src of srcs) {
				const fileName = extractFileName(src);
				const fullDest = dest.endsWith('/')
					? dest + fileName
					: `${dest}/${fileName}`;
				const newPath = fullDest.replace(MULTIPLE_SLASH_REGEX, '/');
				await moveFile(fs, src, newPath);
			}
		}
	};
}

async function moveFile(fs: FS, src: string, dest: string): Promise<void> {
	const content = await fs.readFile(src);
	await fs.writeFile(dest, content);
	await fs.deleteFile(src);
}
