import { expect, test } from 'bun:test';
import { compileTree } from '@/compile/command/tree/tree';
import { cmd, literal } from '@/ir';

test('tree with no arguments defaults to current directory', () => {
	expect(compileTree(cmd('tree', []))).toEqual({
		args: {
			ascii: false,
			classify: false,
			dirsOnly: false,
			excludePatterns: [],
			fullPath: false,
			includePatterns: [],
			matchDirs: false,
			maxDepth: null,
			noReport: false,
			paths: [literal('.')],
			prune: false,
			showAll: false,
		},
		cmd: 'tree',
	});
});

test('tree parses supported listing and filtering options', () => {
	expect(
		compileTree(
			cmd('tree', [
				literal('-a'),
				literal('-d'),
				literal('-f'),
				literal('-F'),
				literal('-A'),
				literal('-L'),
				literal('2'),
				literal('-P'),
				literal('*.ts'),
				literal('-I'),
				literal('node_modules'),
				literal('--prune'),
				literal('--matchdirs'),
				literal('--noreport'),
				literal('/workspace'),
			])
		)
	).toEqual({
		args: {
			ascii: true,
			classify: true,
			dirsOnly: true,
			excludePatterns: [literal('node_modules')],
			fullPath: true,
			includePatterns: [literal('*.ts')],
			matchDirs: true,
			maxDepth: 2,
			noReport: true,
			paths: [literal('/workspace')],
			prune: true,
			showAll: true,
		},
		cmd: 'tree',
	});
});
