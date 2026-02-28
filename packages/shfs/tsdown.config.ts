import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		fs: 'src/fs/index.ts',
		'fs/cache': 'src/fs/cache/index.ts',
		'util/path': 'src/util/path.ts',
	},
	format: ['esm'],
	dts: true,
	clean: true,
	sourcemap: true,
});
