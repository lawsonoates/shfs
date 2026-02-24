import { expect, test } from 'bun:test';
import { literal, type PipelineIR, type ScriptIR } from '@shfs/compiler';

import { collect } from '../consumer/consumer';
import { MemoryFS } from '../fs/memory';
import type { FileRecord, LineRecord, Record as ShellRecord } from '../record';
import { execute } from './execute';

const textDecoder = new TextDecoder();

test('writes stream output to redirected file', async () => {
	const fs = new MemoryFS();
	fs.setFile('input.txt', 'alpha\nbeta\ngamma');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cat'),
			args: [literal('input.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: 'input.txt' },
		steps: [
			{
				cmd: 'cat',
				redirections: [
					{ kind: 'output', target: literal('output.txt') },
				],
				args: {
					files: [literal('input.txt')],
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(textDecoder.decode(await fs.readFile('output.txt'))).toBe(
		'alpha\nbeta\ngamma'
	);
});

test('uses input redirection when no file args are provided', async () => {
	const fs = new MemoryFS();
	fs.setFile('input.txt', 'alpha\nbeta\ngamma');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('head'),
			args: [],
			redirections: [],
		},
		source: { kind: 'fs', glob: '**/*' },
		steps: [
			{
				cmd: 'head',
				redirections: [{ kind: 'input', target: literal('input.txt') }],
				args: {
					n: 2,
					files: [],
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const lineRecords = records.filter(
		(record): record is LineRecord => record.kind === 'line'
	);
	expect(lineRecords.map((record) => record.text)).toEqual(['alpha', 'beta']);
});

test('supports combined input and output redirection', async () => {
	const fs = new MemoryFS();
	fs.setFile('input.txt', 'alpha\nbeta\ngamma');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cat'),
			args: [],
			redirections: [],
		},
		source: { kind: 'fs', glob: '**/*' },
		steps: [
			{
				cmd: 'cat',
				redirections: [
					{ kind: 'input', target: literal('input.txt') },
					{ kind: 'output', target: literal('copy.txt') },
				],
				args: {
					files: [],
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(textDecoder.decode(await fs.readFile('copy.txt'))).toBe(
		'alpha\nbeta\ngamma'
	);
});

test('creates an empty output file when redirecting sink commands', async () => {
	const fs = new MemoryFS();

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('touch'),
			args: [literal('created.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: 'created.txt' },
		steps: [
			{
				cmd: 'touch',
				redirections: [{ kind: 'output', target: literal('logs.txt') }],
				args: {
					files: [literal('created.txt')],
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(await fs.exists('created.txt')).toBe(true);
	expect(textDecoder.decode(await fs.readFile('logs.txt'))).toBe('');
});

test('executes multi-step stream pipelines end-to-end', async () => {
	const fs = new MemoryFS();
	fs.setFile('input.txt', 'alpha\nbeta\ngamma');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cat'),
			args: [literal('input.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: 'input.txt' },
		steps: [
			{
				cmd: 'cat',
				args: {
					files: [literal('input.txt')],
				},
			},
			{
				cmd: 'tail',
				args: {
					files: [],
					n: 1,
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const lineRecords = records.filter(
		(record): record is LineRecord => record.kind === 'line'
	);
	expect(lineRecords.map((record) => record.text)).toEqual(['gamma']);
});

test('wires cp force flag through execute', async () => {
	const fs = new MemoryFS();
	fs.setFile('source.txt', 'from source');
	fs.setFile('dest.txt', 'existing');

	const withoutForce: PipelineIR = {
		firstCommand: {
			name: literal('cp'),
			args: [literal('source.txt'), literal('dest.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: 'source.txt' },
		steps: [
			{
				cmd: 'cp',
				args: {
					dest: literal('dest.txt'),
					force: false,
					interactive: false,
					recursive: false,
					srcs: [literal('source.txt')],
				},
			},
		],
	};

	const firstResult = execute(withoutForce, fs);
	expect(firstResult.kind).toBe('sink');
	if (firstResult.kind === 'sink') {
		await expect(firstResult.value).rejects.toThrow(
			'cp: destination exists (use -f to overwrite): dest.txt'
		);
	}

	const withForce: PipelineIR = {
		...withoutForce,
		steps: [
			{
				cmd: 'cp',
				args: {
					dest: literal('dest.txt'),
					force: true,
					interactive: false,
					recursive: false,
					srcs: [literal('source.txt')],
				},
			},
		],
	};

	const secondResult = execute(withForce, fs);
	expect(secondResult.kind).toBe('sink');
	if (secondResult.kind === 'sink') {
		await secondResult.value;
	}

	expect(textDecoder.decode(await fs.readFile('dest.txt'))).toBe(
		'from source'
	);
});

test('wires mkdir through execute', async () => {
	const fs = new MemoryFS();
	const ir: PipelineIR = {
		firstCommand: {
			name: literal('mkdir'),
			args: [literal('/newdir')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/newdir' },
		steps: [
			{
				cmd: 'mkdir',
				args: {
					parents: false,
					paths: [literal('/newdir')],
					recursive: false,
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	const stat = await fs.stat('/newdir');
	expect(stat.isDirectory).toBe(true);
});

test('wires mv force flag through execute', async () => {
	const fs = new MemoryFS();
	fs.setFile('/source.txt', 'new content');
	fs.setFile('/dest.txt', 'old content');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('mv'),
			args: [literal('/source.txt'), literal('/dest.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/source.txt' },
		steps: [
			{
				cmd: 'mv',
				args: {
					dest: literal('/dest.txt'),
					force: true,
					interactive: false,
					srcs: [literal('/source.txt')],
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(textDecoder.decode(await fs.readFile('/dest.txt'))).toBe(
		'new content'
	);
	await expect(fs.readFile('/source.txt')).rejects.toThrow('File not found');
});

test('wires rm force flag through execute', async () => {
	const fs = new MemoryFS();

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('rm'),
			args: [literal('/missing.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/missing.txt' },
		steps: [
			{
				cmd: 'rm',
				args: {
					force: true,
					interactive: false,
					paths: [literal('/missing.txt')],
					recursive: false,
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}
});

test('wires ls long format through execute', async () => {
	const fs = new MemoryFS();
	fs.setFile('/alpha.txt', 'a');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('ls'),
			args: [literal('/*')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/*' },
		steps: [
			{
				cmd: 'ls',
				args: {
					longFormat: true,
					paths: [literal('/*')],
					showAll: false,
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const lineRecords = records.filter(
		(record): record is LineRecord => record.kind === 'line'
	);
	expect(lineRecords.length).toBeGreaterThan(0);
	expect(lineRecords[0]?.text.includes('/alpha.txt')).toBe(true);
});

test('ls with dot path does not recurse into nested paths', async () => {
	const fs = new MemoryFS();
	fs.setFile('/top.txt', 'top');
	fs.setFile('/nested/deep.txt', 'deep');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('ls'),
			args: [literal('.')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '.' },
		steps: [
			{
				cmd: 'ls',
				args: {
					longFormat: false,
					paths: [literal('.')],
					showAll: false,
				},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const filePaths = records
		.filter((record): record is FileRecord => record.kind === 'file')
		.map((record) => record.path);

	expect(filePaths).toContain('/top.txt');
	expect(filePaths).not.toContain('/nested/deep.txt');
});

test('ls with dot path uses execution context cwd', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace', true);
	fs.setFile('/workspace/file.txt', 'content');
	fs.setFile('/other.txt', 'other');

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('ls'),
			args: [literal('.')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '.' },
		steps: [
			{
				cmd: 'ls',
				args: {
					longFormat: false,
					paths: [literal('.')],
					showAll: false,
				},
			},
		],
	};

	const result = execute(ir, fs, { cwd: '/workspace' });
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const filePaths = records
		.filter((record): record is FileRecord => record.kind === 'file')
		.map((record) => record.path);

	expect(filePaths).toContain('/workspace/file.txt');
	expect(filePaths).not.toContain('/other.txt');
});

test('wires pwd through execute', async () => {
	const fs = new MemoryFS();

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('pwd'),
			args: [],
			redirections: [],
		},
		source: { kind: 'fs', glob: '**/*' },
		steps: [
			{
				cmd: 'pwd',
				args: {},
			},
		],
	};

	const result = execute(ir, fs);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}

	const records = await collect<ShellRecord>()(result.value);
	const lines = records
		.filter((record): record is LineRecord => record.kind === 'line')
		.map((record) => record.text);

	expect(lines).toEqual(['/']);
});

test('pwd uses execution context cwd', async () => {
	const fs = new MemoryFS();

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('pwd'),
			args: [],
			redirections: [],
		},
		source: { kind: 'fs', glob: '**/*' },
		steps: [
			{
				cmd: 'pwd',
				args: {},
			},
		],
	};

	const result = execute(ir, fs, { cwd: '/workspace/project' });
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}

	const records = await collect<ShellRecord>()(result.value);
	const lines = records
		.filter((record): record is LineRecord => record.kind === 'line')
		.map((record) => record.text);

	expect(lines).toEqual(['/workspace/project']);
});

test('cd updates execution context cwd for absolute paths', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace');
	const context = { cwd: '/' };

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cd'),
			args: [literal('/workspace')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/workspace' },
		steps: [
			{
				cmd: 'cd',
				args: { path: literal('/workspace') },
			},
		],
	};

	const result = execute(ir, fs, context);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(context.cwd).toBe('/workspace');
});

test('cd resolves relative and parent paths against cwd', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/project', true);
	const context = { cwd: '/workspace' };

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cd'),
			args: [literal('project/..')],
			redirections: [],
		},
		source: { kind: 'fs', glob: 'project/..' },
		steps: [
			{
				cmd: 'cd',
				args: { path: literal('project/..') },
			},
		],
	};

	const result = execute(ir, fs, context);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await result.value;
	}

	expect(context.cwd).toBe('/workspace');
});

test('cd throws when target does not exist', async () => {
	const fs = new MemoryFS();
	const context = { cwd: '/' };

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cd'),
			args: [literal('/missing')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/missing' },
		steps: [
			{
				cmd: 'cd',
				args: { path: literal('/missing') },
			},
		],
	};

	const result = execute(ir, fs, context);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await expect(result.value).rejects.toThrow(
			'cd: no such file or directory: /missing'
		);
	}
});

test('cd throws when target is a file', async () => {
	const fs = new MemoryFS();
	fs.setFile('/file.txt', 'hello');
	const context = { cwd: '/' };

	const ir: PipelineIR = {
		firstCommand: {
			name: literal('cd'),
			args: [literal('/file.txt')],
			redirections: [],
		},
		source: { kind: 'fs', glob: '/file.txt' },
		steps: [
			{
				cmd: 'cd',
				args: { path: literal('/file.txt') },
			},
		],
	};

	const result = execute(ir, fs, context);
	expect(result.kind).toBe('sink');
	if (result.kind === 'sink') {
		await expect(result.value).rejects.toThrow(
			'cd: not a directory: /file.txt'
		);
	}
});

test('executes script statements in deterministic order', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace', true);
	const context = { cwd: '/' };

	const script: ScriptIR = {
		statements: [
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('cd'),
						args: [literal('/workspace')],
						redirections: [],
					},
					source: { kind: 'fs', glob: '/workspace' },
					steps: [
						{
							cmd: 'cd',
							args: { path: literal('/workspace') },
						},
					],
				},
			},
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('pwd'),
						args: [],
						redirections: [],
					},
					source: { kind: 'fs', glob: '**/*' },
					steps: [
						{
							cmd: 'pwd',
							args: {},
						},
					],
				},
			},
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('cd'),
						args: [literal('/')],
						redirections: [],
					},
					source: { kind: 'fs', glob: '/' },
					steps: [
						{
							cmd: 'cd',
							args: { path: literal('/') },
						},
					],
				},
			},
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('pwd'),
						args: [],
						redirections: [],
					},
					source: { kind: 'fs', glob: '**/*' },
					steps: [
						{
							cmd: 'pwd',
							args: {},
						},
					],
				},
			},
		],
	};

	const result = execute(script, fs, context);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const lines = records
		.filter((record): record is LineRecord => record.kind === 'line')
		.map((record) => record.text);

	expect(lines).toEqual(['/workspace', '/']);
	expect(context.cwd).toBe('/');
});

test('script execution reuses shared context across statements', async () => {
	const fs = new MemoryFS();
	await fs.mkdir('/workspace/project', true);
	const context = { cwd: '/' };

	const script: ScriptIR = {
		statements: [
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('cd'),
						args: [literal('/workspace/project')],
						redirections: [],
					},
					source: { kind: 'fs', glob: '/workspace/project' },
					steps: [
						{
							cmd: 'cd',
							args: { path: literal('/workspace/project') },
						},
					],
				},
			},
			{
				chainMode: 'always',
				pipeline: {
					firstCommand: {
						name: literal('pwd'),
						args: [],
						redirections: [],
					},
					source: { kind: 'fs', glob: '**/*' },
					steps: [
						{
							cmd: 'pwd',
							args: {},
						},
					],
				},
			},
		],
	};

	const result = execute(script, fs, context);
	expect(result.kind).toBe('stream');
	if (result.kind !== 'stream') {
		throw new Error('Expected stream result');
	}
	const records = await collect<ShellRecord>()(result.value);
	const lines = records
		.filter((record): record is LineRecord => record.kind === 'line')
		.map((record) => record.text);

	expect(lines).toEqual(['/workspace/project']);
	expect(context.cwd).toBe('/workspace/project');
});
