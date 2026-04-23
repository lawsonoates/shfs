import { expect, test } from 'bun:test';

import { Parser, parse } from './parser';
import { ParseSyntaxError } from './syntax-error';

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

test('parse preserves ordered parts for mixed glob words', () => {
	const program = parse('ls src/*.test.ts');
	const arg = program.statements[0]?.pipeline.commands[0]?.args[0];

	expect(
		arg?.parts.map((part) => {
			if (part.kind === 'literal') {
				return { kind: part.kind, text: part.value };
			}
			if (part.kind === 'glob') {
				return { kind: part.kind, text: part.pattern };
			}
			return { kind: part.kind, text: '(sub)' };
		})
	).toEqual([
		{ kind: 'literal', text: 'src/' },
		{ kind: 'glob', text: '*' },
		{ kind: 'literal', text: '.test.ts' },
	]);
});

test('parse preserves spans and nested substitutions for mixed command substitution words', () => {
	const program = parse('echo foo(echo (echo bar))baz');
	const arg = program.statements[0]?.pipeline.commands[0]?.args[0];
	const commandSubPart = arg?.parts[1];

	expect(arg?.parts.map((part) => part.kind)).toEqual([
		'literal',
		'commandSub',
		'literal',
	]);
	expect(arg?.parts.map((part) => part.span.start.offset)).toEqual([
		5, 8, 25,
	]);
	expect(arg?.parts.map((part) => part.span.end.offset)).toEqual([8, 25, 28]);

	if (!commandSubPart || commandSubPart.kind !== 'commandSub') {
		throw new Error('Expected command substitution part');
	}

	const nestedArg =
		commandSubPart.program.statements[0]?.pipeline.commands[0]?.args[0];
	expect(nestedArg?.hasCommandSub).toBe(true);
});

test('parse preserves mixed quoted and unquoted word parts', () => {
	const program = parse('echo prefix"*"suffix?.txt');
	const arg = program.statements[0]?.pipeline.commands[0]?.args[0];

	expect(
		arg?.parts.map((part) => {
			if (part.kind === 'literal') {
				return { kind: part.kind, text: part.value };
			}
			if (part.kind === 'glob') {
				return { kind: part.kind, text: part.pattern };
			}
			return { kind: part.kind, text: '(sub)' };
		})
	).toEqual([
		{ kind: 'literal', text: 'prefix' },
		{ kind: 'literal', text: '*' },
		{ kind: 'literal', text: 'suffix' },
		{ kind: 'glob', text: '?' },
		{ kind: 'literal', text: '.txt' },
	]);
});

// Quoted & before > is an argument, not a redirection prefix.
test('parse keeps quoted redirection prefix as an argument', () => {
	const command = parse("echo '&'>out").statements[0]?.pipeline.commands[0];

	expect(command?.args.map((arg) => arg.literalValue)).toEqual(['&']);
	expect(
		command?.redirections.map((redirection) => redirection.sourceFd)
	).toEqual([1]);
});

// Quoted & before | is an argument, not the &| pipe operator.
test('parse keeps quoted pipe prefix as an argument', () => {
	const command = parse("echo '&'|cat").statements[0]?.pipeline.commands[0];

	expect(command?.args.map((arg) => arg.literalValue)).toEqual(['&']);
	expect(command?.redirections).toHaveLength(0);
});

test('parse records chain metadata for and/or statements', () => {
	const program = parse('test 1 = 1; and echo pass; or echo fail');
	expect(program.statements.map((statement) => statement.chainMode)).toEqual([
		'always',
		'and',
		'or',
	]);
});

test('unexpected token syntax failures surface through shared parse diagnostics', () => {
	const parser = new Parser('echo )');

	try {
		parser.parse();
		throw new Error('Expected parse failure');
	} catch (error) {
		if (!(error instanceof ParseSyntaxError)) {
			throw error;
		}

		expect(error.diagnostic).toMatchObject({
			code: 'unexpected-token',
			message: "Unexpected token ')', expected newline or ;",
			phase: 'parse',
			severity: 'error',
		});
		expect(error.diagnostic.location.span?.start.line).toBe(1);
		expect(parser.getErrorReporter().getDiagnostics()[0]).toMatchObject({
			code: 'unexpected-token',
			phase: 'parse',
		});
	}
});

test('unexpected EOF syntax failures surface through shared parse diagnostics', () => {
	const parser = new Parser('cat <');

	try {
		parser.parse();
		throw new Error('Expected parse failure');
	} catch (error) {
		if (!(error instanceof ParseSyntaxError)) {
			throw error;
		}

		expect(error.diagnostic).toMatchObject({
			code: 'unexpected-eof',
			phase: 'parse',
			severity: 'error',
		});
		expect(error.diagnostic.message).toContain('Unexpected end of input');
	}
});
