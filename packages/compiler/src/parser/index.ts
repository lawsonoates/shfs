/**
 * Parser module entry point.
 *
 * This file provides a demo of the parser.
 * For actual imports, use the specific modules directly:
 * - ./parser for Parser class and parse function
 * - ./ast for AST types
 */

import { Parser } from './parser';

// Demo usage
if (import.meta.main) {
	const parser = new Parser('echo "Hello, world!"');
	const ast = parser.parse();

	console.log('=== Parser Output ===');
	console.log(JSON.stringify(ast, null, 2));
	console.log('=== End Output ===');
}
