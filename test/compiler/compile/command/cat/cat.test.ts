import { expect, test } from 'bun:test';
import { compileCat } from '#compiler/compile/command/cat/cat';
import { cmd, literal } from '#compiler/ir';

test('cat with single file', () => {
	const result = compileCat(cmd('cat', [literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with multiple files', () => {
	const result = compileCat(
		cmd('cat', [
			literal('file1.txt'),
			literal('file2.txt'),
			literal('file3.txt'),
		])
	);
	expect(result).toEqual({
		args: {
			files: [
				literal('file1.txt'),
				literal('file2.txt'),
				literal('file3.txt'),
			],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with no arguments throws error', () => {
	expect(() => {
		compileCat(cmd('cat', []));
	}).toThrow('cat requires at least one file');
});

test('cat with input redirection and no file arguments', () => {
	const result = compileCat(
		cmd('cat', [], [{ kind: 'input', target: literal('input.txt') }])
	);
	expect(result).toEqual({
		args: {
			files: [],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -n flag', () => {
	const result = compileCat(cmd('cat', [literal('-n'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: true,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with combined flags -nE', () => {
	const result = compileCat(
		cmd('cat', [literal('-nE'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: true,
			numberNonBlank: false,
			showAll: false,
			showEnds: true,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -b flag', () => {
	const result = compileCat(cmd('cat', [literal('-b'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: true,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -A flag', () => {
	const result = compileCat(cmd('cat', [literal('-A'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: true,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -v flag', () => {
	const result = compileCat(cmd('cat', [literal('-v'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: true,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -T flag', () => {
	const result = compileCat(cmd('cat', [literal('-T'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: true,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with -s flag', () => {
	const result = compileCat(cmd('cat', [literal('-s'), literal('file.txt')]));
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: true,
		},
		cmd: 'cat',
	});
});

test('cat with combined flags -bE', () => {
	const result = compileCat(
		cmd('cat', [literal('-bE'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: true,
			showAll: false,
			showEnds: true,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with combined flags -ATv', () => {
	const result = compileCat(
		cmd('cat', [literal('-ATv'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: false,
			numberNonBlank: false,
			showAll: true,
			showEnds: false,
			showNonprinting: true,
			showTabs: true,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat with combined flags -nsT', () => {
	const result = compileCat(
		cmd('cat', [literal('-nsT'), literal('file.txt')])
	);
	expect(result).toEqual({
		args: {
			files: [literal('file.txt')],
			numberLines: true,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: true,
			squeezeBlank: true,
		},
		cmd: 'cat',
	});
});

test('cat treats "-" as a positional file token', () => {
	const result = compileCat(cmd('cat', [literal('-')]));
	expect(result).toEqual({
		args: {
			files: [literal('-')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat treats negative-number-like token as positional', () => {
	const result = compileCat(cmd('cat', [literal('-1')]));
	expect(result).toEqual({
		args: {
			files: [literal('-1')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat treats tokens after "--" as positional files', () => {
	const result = compileCat(cmd('cat', [literal('--'), literal('-n')]));
	expect(result).toEqual({
		args: {
			files: [literal('-n')],
			numberLines: false,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});

test('cat keeps flags before "--" and files after "--"', () => {
	const result = compileCat(
		cmd('cat', [literal('-n'), literal('--'), literal('-b')])
	);
	expect(result).toEqual({
		args: {
			files: [literal('-b')],
			numberLines: true,
			numberNonBlank: false,
			showAll: false,
			showEnds: false,
			showNonprinting: false,
			showTabs: false,
			squeezeBlank: false,
		},
		cmd: 'cat',
	});
});
