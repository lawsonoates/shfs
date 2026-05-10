import { expect, test } from 'bun:test';

import { Scanner } from '../../../packages/compiler/src/lexer/scanner';
import { TokenKind } from '../../../packages/compiler/src/lexer/token';

function scanFirstWord(input: string) {
	const [token, eofToken] = new Scanner(input).tokenize();
	if (!(token && eofToken)) {
		throw new Error('Expected word token followed by EOF');
	}
	if (eofToken.kind !== TokenKind.EOF) {
		throw new Error('Expected EOF token');
	}
	return token;
}

function summarizeWordParts(input: string) {
	return scanFirstWord(input).wordParts.map((part) => ({
		end: part.span.end.offset,
		escaped: part.escaped,
		kind: part.kind,
		quote: part.quote,
		start: part.span.start.offset,
		text: part.text,
	}));
}

test('scanner emits mixed glob words as one token with ordered parts', () => {
	const token = scanFirstWord('src/*.test.ts');

	expect(token.kind).toBe(TokenKind.WORD);
	expect(token.spelling).toBe('src/*.test.ts');
	expect(summarizeWordParts('src/*.test.ts')).toEqual([
		{
			end: 4,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 0,
			text: 'src/',
		},
		{
			end: 5,
			escaped: false,
			kind: 'glob',
			quote: 'none',
			start: 4,
			text: '*',
		},
		{
			end: 13,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 5,
			text: '.test.ts',
		},
	]);
});

test('scanner emits mixed command substitution words as one token with ordered parts', () => {
	const token = scanFirstWord('foo(echo bar)baz');

	expect(token.kind).toBe(TokenKind.WORD);
	expect(token.spelling).toBe('foo(echo bar)baz');
	expect(summarizeWordParts('foo(echo bar)baz')).toEqual([
		{
			end: 3,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 0,
			text: 'foo',
		},
		{
			end: 13,
			escaped: false,
			kind: 'commandSub',
			quote: 'none',
			start: 3,
			text: '(echo bar)',
		},
		{
			end: 16,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 13,
			text: 'baz',
		},
	]);
});

test('scanner keeps quoted wildcard characters as literal metadata', () => {
	const token = scanFirstWord('prefix"*"suffix');

	expect(token.hasGlob).toBe(false);
	expect(
		token.wordParts.map((part) => ({
			kind: part.kind,
			quote: part.quote,
			text: part.text,
		}))
	).toEqual([
		{ kind: 'literal', quote: 'none', text: 'prefix' },
		{ kind: 'literal', quote: 'double', text: '*' },
		{ kind: 'literal', quote: 'none', text: 'suffix' },
	]);
});

test('scanner keeps escaped wildcard characters as literal metadata', () => {
	const token = scanFirstWord('foo\\*bar');

	expect(token.hasGlob).toBe(false);
	expect(
		token.wordParts.map((part) => ({
			escaped: part.escaped,
			kind: part.kind,
			text: part.text,
		}))
	).toEqual([
		{ escaped: false, kind: 'literal', text: 'foo' },
		{ escaped: true, kind: 'literal', text: '*' },
		{ escaped: false, kind: 'literal', text: 'bar' },
	]);
});
