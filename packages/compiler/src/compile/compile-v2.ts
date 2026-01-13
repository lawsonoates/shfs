/**
 * AST-based compiler for the Fish subset parser.
 *
 * This compiler traverses the AST and produces a PipelineIRV2
 * with enhanced word expansion information.
 *
 * Key differences from the old compile.ts:
 * - Accepts Program from the new parser (not ShellAST)
 * - Produces PipelineIRV2 with ExpandedWord types
 * - Preserves word structure for runtime expansion
 */

import {
	commandSub,
	type ExpandedWord,
	glob,
	literal,
	type PipelineIRV2,
	type RedirectionIR,
	type SimpleCommandIR,
	type SourceIR,
	type StepIRV2,
} from '../ir';
import type {
	CommandSubPart,
	GlobPart,
	LiteralPart,
	Pipeline,
	Program,
	Redirection,
	SimpleCommand,
	Word,
	WordPart,
} from '../parser/ast';
import { CommandHandlerV2 } from './command/handler-v2';

/**
 * Compile a Program AST to a PipelineIRV2.
 *
 * @param program The parsed Program AST
 * @returns The compiled PipelineIRV2
 */
export function compileV2(program: Program): PipelineIRV2 {
	const compiler = new ProgramCompiler();
	return compiler.compileProgram(program);
}

/**
 * Compiler that traverses the AST to produce IR.
 *
 * Note: We don't implement the Visitor interface directly because
 * different AST nodes need to return different types. Instead, we
 * manually traverse the AST with type-specific methods.
 */
class ProgramCompiler {
	/**
	 * Compile a Program to a PipelineIRV2.
	 */
	compileProgram(node: Program): PipelineIRV2 {
		return this.compilePipeline(node.pipeline);
	}

	/**
	 * Compile a Pipeline to a PipelineIRV2.
	 */
	compilePipeline(node: Pipeline): PipelineIRV2 {
		const commands: SimpleCommandIR[] = node.commands.map((cmd) =>
			this.compileSimpleCommand(cmd)
		);

		if (commands.length === 0) {
			throw new Error('Pipeline must contain at least one command');
		}

		// First command determines the source
		const firstCmd = commands[0];
		if (!firstCmd) {
			throw new Error('Pipeline must contain at least one command');
		}
		const source = this.determineSource(firstCmd);

		// Compile each command to a step
		const steps: StepIRV2[] = commands.map((cmd) =>
			this.compileCommandToStep(cmd)
		);

		return {
			source,
			steps,
			firstCommand: firstCmd,
		};
	}

	/**
	 * Compile a SimpleCommand to a SimpleCommandIR.
	 */
	compileSimpleCommand(node: SimpleCommand): SimpleCommandIR {
		return {
			name: this.expandWord(node.name),
			args: node.args.map((arg) => this.expandWord(arg)),
			redirections: node.redirections.map((r) =>
				this.compileRedirection(r)
			),
		};
	}

	/**
	 * Compile a Redirection to a RedirectionIR.
	 */
	compileRedirection(node: Redirection): RedirectionIR {
		return {
			kind: node.redirectKind,
			target: this.expandWord(node.target),
		};
	}

	// ─────────────────────────────────────────────────────────
	// Word Expansion
	// ─────────────────────────────────────────────────────────

	/**
	 * Expand a Word to an ExpandedWord.
	 * Handles concatenation of literal parts and detection of globs/command subs.
	 */
	private expandWord(word: Word): ExpandedWord {
		const parts = word.parts;

		// Empty word
		if (parts.length === 0) {
			return literal('');
		}

		// Single part
		if (parts.length === 1) {
			const part = parts[0];
			if (!part) {
				return literal('');
			}
			return this.expandWordPart(part);
		}

		// Check if all parts are literals - concatenate them
		const allLiterals = parts.every((p) => p.kind === 'literal');
		if (allLiterals) {
			const value = parts.map((p) => (p as LiteralPart).value).join('');
			return literal(value);
		}

		// Check for glob pattern mixed with literals (e.g., "foo*.txt")
		const hasGlob = parts.some((p) => p.kind === 'glob');
		if (hasGlob) {
			// Concatenate all parts into a single glob pattern
			const pattern = parts
				.map((p) => {
					if (p.kind === 'literal') {
						return (p as LiteralPart).value;
					}
					if (p.kind === 'glob') {
						return (p as GlobPart).pattern;
					}
					return '';
				})
				.join('');
			return glob(pattern);
		}

		// Check for command substitution
		const hasCommandSub = parts.some((p) => p.kind === 'commandSub');
		if (hasCommandSub) {
			// For now, handle simple case of single command sub
			const cmdSubPart = parts.find(
				(p) => p.kind === 'commandSub'
			) as CommandSubPart;
			const innerCommand = this.serializeProgram(cmdSubPart.program);
			return commandSub(innerCommand);
		}

		// Fallback: concatenate literals
		const value = parts
			.filter((p) => p.kind === 'literal')
			.map((p) => (p as LiteralPart).value)
			.join('');
		return literal(value);
	}

	/**
	 * Expand a single WordPart to an ExpandedWord.
	 */
	private expandWordPart(part: WordPart): ExpandedWord {
		switch (part.kind) {
			case 'literal':
				return literal(part.value);
			case 'glob':
				return glob(part.pattern);
			case 'commandSub': {
				const innerCommand = this.serializeProgram(part.program);
				return commandSub(innerCommand);
			}
			default: {
				const _exhaustive: never = part;
				throw new Error(
					`Unknown word part kind: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	}

	// ─────────────────────────────────────────────────────────
	// Helper methods
	// ─────────────────────────────────────────────────────────

	/**
	 * Determine the source for a pipeline based on the first command.
	 */
	private determineSource(firstCmd: SimpleCommandIR): SourceIR {
		// Convention: first arg of first command is the glob/path
		const firstArg = firstCmd.args[0];
		if (firstArg?.kind === 'literal') {
			return {
				kind: 'fs' as const,
				glob: firstArg.value,
			};
		}
		if (firstArg?.kind === 'glob') {
			return {
				kind: 'fs' as const,
				glob: firstArg.pattern,
			};
		}
		// Default to current directory
		return { kind: 'fs' as const, glob: '**/*' };
	}

	/**
	 * Compile a SimpleCommandIR to a StepIRV2.
	 */
	private compileCommandToStep(cmd: SimpleCommandIR): StepIRV2 {
		const cmdName = this.extractLiteralString(cmd.name);
		if (!cmdName) {
			throw new Error('Command name must be a literal string');
		}

		const handler = CommandHandlerV2.get(cmdName);
		return handler(cmd);
	}

	/**
	 * Extract the literal string value from an ExpandedWord.
	 * Returns null if the word is not a literal.
	 */
	private extractLiteralString(word: ExpandedWord): string | null {
		if (word.kind === 'literal') {
			return word.value;
		}
		return null;
	}

	/**
	 * Serialize a Program AST back to a string representation.
	 * Used for storing command substitution content.
	 */
	private serializeProgram(program: Program): string {
		// Simple serialization: just get the command names and args
		const commands = program.pipeline.commands.map((cmd) => {
			const name = cmd.name.literalValue ?? '?';
			const args = cmd.args
				.map((arg) => arg.literalValue ?? '?')
				.join(' ');
			return args ? `${name} ${args}` : name;
		});
		return commands.join(' | ');
	}
}
