#!/usr/bin/env bun

/**
 * Demo script for the fish subset lexer.
 *
 * Run with: bun run packages/compiler/src/lexer/demo.ts
 * Or: bun packages/compiler/src/lexer/demo.ts
 */

import { Scanner } from './scanner';
import { Token } from './token';

// Example fish subset commands to tokenize
const examples = [
	// Basic commands
	'echo hello world',
	'ls',
	'cat file.txt',

	// Pipelines
	'ls | grep foo',
	'cat file.txt | head | sort',
	'ls | grep pattern | sort | uniq',

	// Quoting
	'echo "hello world"',
	"echo 'single quoted'",
	"grep 'foo bar' file.txt",

	// Command substitution
	'grep (cat patterns.txt) file.txt',
	'echo "files: (ls)"',
	'cat (ls *.txt)',

	// Globbing
	'cat *.txt',
	'ls file?.txt',
	'grep pattern [abc]*.log',

	// Comments
	'# This is a comment',
	'ls # list files',

	// Redirection (Phase 2)
	'cat file.txt > output.txt',
	'grep pattern < input.txt',

	// Mixed examples
	'cat *.txt | grep (cat patterns.txt) | sort',
];

function formatToken(token: Token): string {
	const kindName = Token.kindName(token.kind);

	const spelling = token.spelling
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		.replace(/\r/g, '\\r');

	const flags: string[] = [];
	if (token.isQuoted) {
		flags.push('quoted');
	}
	if (token.hasExpansions) {
		flags.push('cmd-sub');
	}
	if (token.hasGlob) {
		flags.push('glob');
	}

	const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

	return `${kindName.padEnd(12)} "${spelling}"${flagStr}`;
}

function demo(input: string) {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`Input: ${input}`);
	console.log('-'.repeat(80));

	const scanner = new Scanner(input);
	const tokens = scanner.tokenize();

	for (const [index, token] of tokens.entries()) {
		console.log(`${String(index).padStart(3)}: ${formatToken(token)}`);
	}
}

// Run demos
console.log('Fish Subset Lexer Demo');
console.log('='.repeat(80));
console.log('');
console.log('This lexer implements a fish-inspired subset with:');
console.log('  - Pipelines (|)');
console.log('  - Command substitution (...)');
console.log('  - Globbing (* ? [...])');
console.log('  - Single quotes (literal)');
console.log('  - Double quotes (command substitution allowed)');
console.log('  - Comments (#)');
console.log('');
console.log(
	'NOT supported: variables, brace expansion, control flow, functions'
);

if (process.argv.length > 2) {
	// If arguments provided, tokenize them
	const input = process.argv.slice(2).join(' ');
	demo(input);
} else {
	// Otherwise, run all examples
	for (const example of examples) {
		demo(example);
	}
}

console.log(`\n${'='.repeat(80)}`);
console.log('Done!');
