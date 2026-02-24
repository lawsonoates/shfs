import { expect, test } from 'bun:test';

import { parse } from './parser';

test('parse supports newline-separated statements', () => {
	const program = parse('pwd\ncd /tmp');

	expect(program.statements).toHaveLength(2);
	expect(program.statements[0]?.pipeline.commands[0]?.name.literalValue).toBe(
		'pwd'
	);
	expect(program.statements[1]?.pipeline.commands[0]?.name.literalValue).toBe(
		'cd'
	);
});

test('parse supports semicolon-separated statements', () => {
	const program = parse('pwd;cd /tmp');

	expect(program.statements).toHaveLength(2);
	expect(program.statements[0]?.pipeline.commands[0]?.name.literalValue).toBe(
		'pwd'
	);
	expect(program.statements[1]?.pipeline.commands[0]?.name.literalValue).toBe(
		'cd'
	);
});

test('parse supports mixed statement separators', () => {
	const program = parse('pwd; cd /tmp\npwd');

	expect(program.statements).toHaveLength(3);
	expect(program.statements[0]?.pipeline.commands[0]?.name.literalValue).toBe(
		'pwd'
	);
	expect(program.statements[1]?.pipeline.commands[0]?.name.literalValue).toBe(
		'cd'
	);
	expect(program.statements[2]?.pipeline.commands[0]?.name.literalValue).toBe(
		'pwd'
	);
});

test('parse ignores trailing separators', () => {
	const program = parse('pwd;\n');

	expect(program.statements).toHaveLength(1);
	expect(program.statements[0]?.pipeline.commands[0]?.name.literalValue).toBe(
		'pwd'
	);
});

test('parse keeps pipe newline continuation within one statement', () => {
	const program = parse('cat file.txt |\n tail -n 1');

	expect(program.statements).toHaveLength(1);
	expect(program.statements[0]?.pipeline.commands).toHaveLength(2);
});

test('parse supports standalone command substitution in argument position', () => {
	const program = parse('cd (echo subdir)');
	const arg = program.statements[0]?.pipeline.commands[0]?.args[0];
	expect(arg?.hasCommandSub).toBe(true);
});

test('parse supports nested command substitutions in argument position', () => {
	const program = parse('echo (echo (echo nested))');
	const arg = program.statements[0]?.pipeline.commands[0]?.args[0];
	expect(arg?.hasCommandSub).toBe(true);
});

test('parse records chain metadata for and/or statements', () => {
	const program = parse('test 1 = 1; and echo pass; or echo fail');
	expect(program.statements.map((statement) => statement.chainMode)).toEqual([
		'always',
		'and',
		'or',
	]);
});
