import { expect, test } from 'bun:test';

import { Scanner } from '@/lexer/scanner';
import { TokenKind } from '@/lexer/token';

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

test('scanner emits literal word part metadata for simple fast-path words', () => {
	expect(summarizeWordParts('foo')).toEqual([
		{
			end: 3,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 0,
			text: 'foo',
		},
	]);
	expect(summarizeWordParts('123')).toEqual([
		{
			end: 3,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 0,
			text: '123',
		},
	]);
});

test('scanner emits default literal word part metadata for empty quoted words', () => {
	expect(summarizeWordParts('""')).toEqual([
		{
			end: 2,
			escaped: false,
			kind: 'literal',
			quote: 'none',
			start: 0,
			text: '',
		},
	]);
});

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

test('scanner preserves escaped hashes inside command substitutions', () => {
	const tokens = new Scanner('echo (echo foo\\ #bar) after').tokenize();

	expect(tokens.map((token) => token.spelling)).toEqual([
		'echo',
		'(echo foo\\ #bar)',
		'after',
		'',
	]);
});

test('scanner preserves hashes after non-separator characters', () => {
	// features-ampersand-nobg-in-token1.fish keeps a lone `&` inside a word.
	const innerWords = [
		'a&#b',
		'a&&&#b',
		'a\\&&#b',
		'a\\|#b',
		'a\\;#b',
		'a\\<#b',
		'a\\>#b',
		'a\\\n#b',
	];

	for (const innerWord of innerWords) {
		const input = `echo (echo ${innerWord}) after`;
		const tokens = new Scanner(input).tokenize();

		expect(tokens.map((token) => token.spelling)).toEqual([
			'echo',
			`(echo ${innerWord})`,
			'after',
			'',
		]);
	}
});

test('scanner recognizes substitution comments after lexer separators', () => {
	const separators = ['&&', '|', '||', ';', '<', '>', '\n'];

	for (const separator of separators) {
		const substitution = `(echo ok${separator}#comment\n echo after)`;
		const tokens = new Scanner(`echo ${substitution} tail`).tokenize();

		expect(tokens.map((token) => token.spelling)).toEqual([
			'echo',
			substitution,
			'tail',
			'',
		]);
	}
});

test('scanner requires a real command substitution closing delimiter', () => {
	for (const input of ['(echo #)', '(echo (echo nested) #))']) {
		expect(() => scanFirstWord(input)).toThrow();
	}

	for (const input of ['(echo #)\n)', '(echo (echo nested) #))\n)']) {
		expect(scanFirstWord(input).spelling).toBe(input);
	}
});

test('scanner keeps brackets inside indexed command substitutions', () => {
	const cases = [
		{
			expectedIndex: "(string replace ] '' 1])",
			input: "$vals[(string replace ] '' 1])]",
		},
		{
			expectedIndex: '(string replace [ "" 1[)',
			input: '$vals[(string replace [ "" 1[)]',
		},
		{
			expectedIndex: '(string replace "[]" "" "1[]")',
			input: '$vals[(string replace "[]" "" "1[]")]',
		},
	];

	for (const { expectedIndex, input } of cases) {
		const token = scanFirstWord(input);
		const [part] = token.wordParts;
		if (part?.kind !== 'variable') {
			throw new Error('Expected indexed variable word part');
		}
		expect(token.spelling).toBe(input);
		expect(part.index).toBe(expectedIndex);
	}
});

test('scanner tracks nested and escaped substitution delimiters in indexes', () => {
	const cases = [
		{
			expectedIndex: '(echo (string replace ] "" 1]))',
			input: '$vals[(echo (string replace ] "" 1]))]',
		},
		{
			expectedIndex: '(echo \\) ] 1)',
			input: '$vals[(echo \\) ] 1)]',
		},
	];

	for (const { expectedIndex, input } of cases) {
		const token = scanFirstWord(input);
		const [part] = token.wordParts;
		if (part?.kind !== 'variable') {
			throw new Error('Expected indexed variable word part');
		}
		expect(token.spelling).toBe(input);
		expect(part.index).toBe(expectedIndex);
	}
});

test('scanner keeps nested substitution terminators inside variable indexes', () => {
	const cases = [
		{
			expectedIndex: '(echo 1\n)',
			expectedSpelling: '$vals[(echo 1\n)]',
			input: '$vals[(echo 1\n)]',
		},
		{
			expectedIndex: '(echo "1")',
			expectedSpelling: '$vals[(echo "1")]',
			input: '"$vals[(echo "1")]"',
		},
	];

	for (const { expectedIndex, expectedSpelling, input } of cases) {
		const token = scanFirstWord(input);
		const part = token.wordParts.find(
			(wordPart) => wordPart.kind === 'variable'
		);
		if (part?.kind !== 'variable') {
			throw new Error('Expected indexed variable word part');
		}
		expect(token.spelling).toBe(expectedSpelling);
		expect(part.index).toBe(expectedIndex);
	}
});

test('scanner ignores delimiters in indexed substitution comments', () => {
	const cases = ['$vals[(echo 1 #)\n)]', '$vals[(echo 1 # ) ] "\n)]'];

	for (const input of cases) {
		const token = scanFirstWord(input);
		const [part] = token.wordParts;
		if (part?.kind !== 'variable') {
			throw new Error('Expected indexed variable word part');
		}
		expect(token.spelling).toBe(input);
		expect(part.index).toBe(input.slice('$vals['.length, -1));
	}
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

test('scanner decodes Fish backspace escapes', () => {
	expect(scanFirstWord('A\\bB').spelling).toBe('A\bB');
});

test('scanner applies Fish byte escape boundaries', () => {
	expect(scanFirstWord('\\x1').spelling).toBe('\u0001');
	expect(scanFirstWord('\\X41').spelling).toBe('A');
	expect(scanFirstWord('\\x1G').spelling).toBe('\u0001G');
	expect(scanFirstWord('\\X41Z').spelling).toBe('AZ');
	expect(scanFirstWord('\\xC3\\xB6').spelling).toBe('ö');

	for (const escapeSequence of ['\\x', '\\X', '\\xNotHex', '\\X-not']) {
		expect(() =>
			new Scanner(`echo ${escapeSequence}`).tokenize()
		).toThrow();
	}
});

test('scanner rejects octal escapes above the Fish ASCII limit', () => {
	expect(scanFirstWord('\\177').spelling).toBe('\u007f');

	for (const escapeSequence of ['\\200', '\\400', '\\777']) {
		expect(() =>
			new Scanner(`echo ${escapeSequence}`).tokenize()
		).toThrow();
	}
});

test('scanner applies Fish Unicode escape boundaries', () => {
	expect(scanFirstWord('\\U0010FFFF').spelling).toBe(
		String.fromCodePoint(0x10_ff_ff)
	);
	expect(scanFirstWord('\\U1').spelling).toBe('\u0001');
	expect(scanFirstWord('\\uD800').spelling).toBe('\ufffd');

	for (const escapeSequence of [
		'\\U00110000',
		'\\UFFFFFFFF',
		'\\U',
		'\\utest',
	]) {
		expect(() =>
			new Scanner(`echo ${escapeSequence}`).tokenize()
		).toThrow();
	}
});
