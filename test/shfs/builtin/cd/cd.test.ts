import { expect, test } from 'bun:test';
import { literal } from '../../../../packages/compiler/src';
import { cd } from '../../../../packages/shfs/src/builtin/cd/cd';
import { createBuiltinRuntime } from '../../../../packages/shfs/src/builtin/test-runtime';

test('cd updates cwd for existing directory', async () => {
	const runtime = createBuiltinRuntime({ cwd: '/workspace' });
	await runtime.fs.mkdir('/workspace/projects', true);

	await cd(runtime, { path: literal('projects') });

	expect(runtime.context.cwd).toBe('/workspace/projects');
	expect(runtime.context.status).toBe(0);
});

test('cd fails for missing directory', async () => {
	const runtime = createBuiltinRuntime();

	await expect(cd(runtime, { path: literal('/missing') })).rejects.toThrow(
		'cd: directory does not exist: /missing'
	);
});
