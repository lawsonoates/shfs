/**
 * @deprecated Use Program from parser/ast.ts instead.
 *
 * This is the legacy AST type used by the string-based parser.
 * The new AST-based parser produces a Program with richer structure.
 *
 * Migration:
 * ```typescript
 * // Old:
 * import { parse } from '@vsh/compiler/parser';
 * const ast: ShellAST = parse('cat file.txt');
 *
 * // New:
 * import { parseV2 } from '@vsh/compiler';
 * const program: Program = parseV2('cat file.txt');
 * ```
 */
export interface ShellCommand {
	name: string;
	args: string[];
}

/**
 * @deprecated Use Program from parser/ast.ts instead.
 *
 * This is the legacy AST type used by the string-based parser.
 * The new AST-based parser produces a Program with richer structure.
 */
export interface ShellAST {
	commands: ShellCommand[];
}
