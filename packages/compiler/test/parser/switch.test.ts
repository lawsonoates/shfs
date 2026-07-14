import { expect, test } from 'bun:test';

import { BreakStatement, Statement, SwitchStatement } from '@/parser/ast';
import { parse, parseEffect } from '@/parser/parser';

function statement(source: string): SwitchStatement {
	const node = parse(source).statements[0];
	if (!(node instanceof SwitchStatement)) {
		throw new Error('Expected a switch statement');
	}
	return node;
}

test('parse builds switch cases with patterns and bodies', () => {
	const node = statement(
		'switch $animal\ncase cat wolf\n echo mammal\ncase "*"\n echo unknown\nend'
	);

	expect(node.value.parts[0]).toMatchObject({
		kind: 'variable',
		name: 'animal',
	});
	expect(
		node.cases.map((branch) =>
			branch.patterns.map((pattern) => pattern.literalValue)
		)
	).toEqual([['cat', 'wolf'], ['*']]);
	expect(node.cases.map((branch) => branch.body)).toHaveLength(2);
	expect(node.cases[0]?.body[0]).toBeInstanceOf(Statement);
});

test('parse supports nested switches and empty case pattern lists', () => {
	const node = statement(
		'switch outer\ncase\n echo never\ncase outer\n switch inner\n case inner\n  echo nested\n end\nend'
	);

	expect(node.cases[0]?.patterns).toEqual([]);
	expect(node.cases[1]?.body[0]).toBeInstanceOf(SwitchStatement);
});

test('parse allows break in a switch only when a loop encloses it', () => {
	const program = parse(
		'for item in one\n switch $item\n case one\n  break\n end\nend'
	);
	const loop = program.statements[0];
	if (!(loop && 'body' in loop)) {
		throw new Error('Expected a loop statement');
	}
	const node = loop.body[0];
	if (!(node instanceof SwitchStatement)) {
		throw new Error('Expected a nested switch statement');
	}
	expect(node.cases[0]?.body[0]).toBeInstanceOf(BreakStatement);

	const result = parseEffect('switch one\ncase one\n break\nend');
	expect(result.isErr()).toBeTrue();
	if (result.isErr()) {
		expect(result.error.diagnostic.code).toBe('loop-control-outside-loop');
	}
});

test('parse rejects case outside the directly enclosing switch', () => {
	const top = parseEffect('case one\n echo nope');
	expect(top.isErr()).toBeTrue();
	if (top.isErr()) {
		expect(top.error.diagnostic.code).toBe('case-outside-switch');
	}

	const nested = parseEffect(
		'switch one\ncase one\n if true\n  case nested\n end\nend'
	);
	expect(nested.isErr()).toBeTrue();
	if (nested.isErr()) {
		expect(nested.error.diagnostic.code).toBe('case-outside-switch');
	}
});

test('parse rejects missing and extra switch values', () => {
	const missing = parseEffect('switch\ncase ""\nend');
	expect(missing.isErr()).toBeTrue();
	if (missing.isErr()) {
		expect(missing.error.diagnostic.code).toBe(
			'invalid-switch-value-count'
		);
	}

	const extra = parseEffect('switch one two\ncase one\nend');
	expect(extra.isErr()).toBeTrue();
	if (extra.isErr()) {
		expect(extra.error.diagnostic.code).toBe('invalid-switch-value-count');
	}
});

test('parse rejects switch bodies before the first case', () => {
	const result = parseEffect('switch one\necho nope\ncase one\nend');
	expect(result.isErr()).toBeTrue();
	if (result.isErr()) {
		expect(result.error.diagnostic.code).toBe('expected-switch-case');
	}
});
