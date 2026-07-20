import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		fs: 'src/fs/index.ts',
		'code-mode': 'src/code-mode/index.ts',
		'util/path': 'src/util/path.ts',
	},
	format: ['esm'],
	dts: true,
	clean: true,
	sourcemap: true,
	deps: {
		alwaysBundle: [/^better-result(?:\/.*)?$/, /^picomatch(?:\/.*)?$/],
		onlyBundle: false,
	},
});
