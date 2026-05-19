/**
 * AST-based compiler for the Fish subset parser.
 *
 * This compiler traverses the AST and produces script-level IR
 * with enhanced word expansion information.
 *
 * Key differences from the old compile.ts:
 * - Accepts Program from the new parser (not ShellAST)
 * - Produces ScriptIR/PipelineIR with ExpandedWord types
 * - Preserves word structure for runtime expansion
 */

import {
	commandSub,
	compound,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordHasCommandSub,
	expandedWordToString,
	glob,
	literal,
	type PipelineIR,
	type RedirectionIR,
	type ScriptIR,
	type ScriptStatementIR,
	type SimpleCommandIR,
	type SourceIR,
	type StepIR,
} from '../ir';
import type {
	Pipeline,
	Program,
	Redirection,
	SimpleCommand,
	Statement,
	Word,
	WordPart,
} from '../parser/ast';
import { CommandHandler } from './command/handler';

/**
 * Compile a Program AST to a ScriptIR.
 *
 * @param program The parsed Program AST
 * @returns The compiled ScriptIR
 */
export function compile(program: Program): ScriptIR {
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
	 * Compile a Program to a ScriptIR.
	 */
	compileProgram(node: Program): ScriptIR {
		const statements = new Array<ScriptStatementIR>(node.statements.length);
		for (let index = 0; index < node.statements.length; index++) {
			const statement = node.statements[index];
			if (statement) {
				statements[index] = this.compileStatement(statement);
			}
		}
		return { statements };
	}

	/**
	 * Compile a script statement to ScriptStatementIR.
	 */
	compileStatement(node: Statement): ScriptStatementIR {
		return {
			chainMode: node.chainMode,
			pipeline: this.compilePipeline(node.pipeline),
		};
	}

	/**
	 * Compile a Pipeline to a PipelineIR.
	 */
	compilePipeline(node: Pipeline): PipelineIR {
		const commands = new Array<SimpleCommandIR>(node.commands.length);
		for (let index = 0; index < node.commands.length; index++) {
			const command = node.commands[index];
			if (command) {
				commands[index] = this.compileSimpleCommand(command);
			}
		}

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
		const steps = new Array<StepIR>(commands.length);
		for (let index = 0; index < commands.length; index++) {
			const command = commands[index];
			if (command) {
				steps[index] = this.compileCommandToStep(command);
			}
		}

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
		const args = new Array<ExpandedWord>(node.args.length);
		for (let index = 0; index < node.args.length; index++) {
			const arg = node.args[index];
			if (arg) {
				args[index] = this.expandWord(arg);
			}
		}

		const redirections = new Array<RedirectionIR>(node.redirections.length);
		for (let index = 0; index < node.redirections.length; index++) {
			const redirection = node.redirections[index];
			if (redirection) {
				redirections[index] = this.compileRedirection(redirection);
			}
		}

		return {
			name: this.expandWord(node.name),
			args,
			redirections,
		};
	}

	/**
	 * Compile a Redirection to a RedirectionIR.
	 */
	compileRedirection(node: Redirection): RedirectionIR {
		return {
			kind: node.redirectKind,
			mode: node.mode,
			sourceFd: node.sourceFd,
			targetFd: node.targetFd,
			append: node.append,
			noclobber: node.noclobber,
			optional: node.optional,
			target: this.expandWord(node.target),
		};
	}

	// ─────────────────────────────────────────────────────────
	// Word Expansion
	// ─────────────────────────────────────────────────────────

	/**
	 * Expand a Word to an ExpandedWord.
	 * Preserves ordered parts for mixed words instead of flattening them.
	 */
	private expandWord(word: Word): ExpandedWord {
		if (word.parts.length === 0) {
			return literal('');
		}

		if (word.parts.length === 1) {
			const firstPart = word.parts[0];
			return firstPart ? this.expandWordPart(firstPart) : literal('');
		}

		const expandedParts = new Array<ExpandedWordPart>(word.parts.length);
		let allLiterals = true;
		let literalValue = '';
		for (let index = 0; index < word.parts.length; index++) {
			const part = word.parts[index];
			if (!part) {
				continue;
			}
			const expandedPart = this.expandWordPart(part);
			expandedParts[index] = expandedPart;
			if (expandedPart.kind === 'literal') {
				literalValue += expandedPart.value;
			} else {
				allLiterals = false;
			}
		}

		return allLiterals ? literal(literalValue) : compound(expandedParts);
	}

	/**
	 * Expand a single WordPart to an ExpandedWordPart.
	 */
	private expandWordPart(part: WordPart): ExpandedWordPart {
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
		if (firstArg && !expandedWordHasCommandSub(firstArg)) {
			return {
				kind: 'fs' as const,
				glob: expandedWordToString(firstArg),
			};
		}
		// Default to current directory
		return { kind: 'fs' as const, glob: '**/*' };
	}

	/**
	 * Compile a SimpleCommandIR to a StepIR.
	 */
	private compileCommandToStep(cmd: SimpleCommandIR): StepIR {
		const cmdName = this.extractLiteralString(cmd.name);
		if (!cmdName) {
			throw new Error('Command name must be a literal string');
		}

		const handler = CommandHandler.get(cmdName);
		const step = handler(cmd);
		return {
			...step,
			redirections: cmd.redirections,
		};
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
		const statements = program.statements.map((statement) =>
			this.serializePipeline(statement.pipeline)
		);
		return statements.join('; ');
	}

	private serializePipeline(pipeline: Pipeline): string {
		const segments: string[] = [];
		for (let index = 0; index < pipeline.commands.length; index++) {
			const command = pipeline.commands[index];
			if (!command) {
				continue;
			}
			const hasNextCommand = index < pipeline.commands.length - 1;
			segments.push(
				this.serializeCommand(command, {
					omitPipeRedirections: hasNextCommand,
				})
			);
			if (hasNextCommand) {
				segments.push(this.serializePipelineOperator(command));
			}
		}
		return segments.join(' ');
	}

	private serializeCommand(
		command: SimpleCommand,
		options: { omitPipeRedirections?: boolean } = {}
	): string {
		const segments = [this.serializeWord(command.name)];
		for (const arg of command.args) {
			segments.push(this.serializeWord(arg));
		}
		for (const redirection of command.redirections) {
			if (options.omitPipeRedirections && redirection.mode === 'pipe') {
				continue;
			}
			segments.push(this.serializeRedirection(redirection));
		}
		return segments.join(' ');
	}

	private serializePipelineOperator(command: SimpleCommand): string {
		const pipeRedirections = command.redirections.filter(
			(redirection) =>
				redirection.redirectKind === 'output' &&
				redirection.mode === 'pipe'
		);
		const pipesStdout = pipeRedirections.some(
			(redirection) => redirection.sourceFd === 1
		);
		const pipesStderr = pipeRedirections.some(
			(redirection) => redirection.sourceFd === 2
		);

		if (pipesStdout && pipesStderr) {
			return '&|';
		}
		const onlyPipeRedirection = pipeRedirections[0];
		if (pipeRedirections.length === 1 && onlyPipeRedirection) {
			return this.serializeRedirection(onlyPipeRedirection);
		}
		return '|';
	}

	private serializeRedirection(redirection: Redirection): string {
		const sourceFd =
			redirection.sourceFd ===
			(redirection.redirectKind === 'input' ? 0 : 1)
				? ''
				: String(redirection.sourceFd);
		if (redirection.redirectKind === 'input') {
			const operator = redirection.optional ? '<?' : '<';
			if (redirection.mode === 'fd') {
				return `${sourceFd}<&${redirection.targetFd}`;
			}
			if (redirection.mode === 'close') {
				return `${sourceFd}<&-`;
			}
			return `${sourceFd}${operator}${this.serializeWord(redirection.target)}`;
		}

		if (redirection.mode === 'pipe') {
			return `${sourceFd}>|`;
		}
		if (redirection.mode === 'fd') {
			return `${sourceFd}>&${redirection.targetFd}`;
		}
		if (redirection.mode === 'close') {
			return `${sourceFd}>&-`;
		}

		let operator = redirection.append ? '>>' : '>';
		if (redirection.noclobber) {
			operator = `${operator}?`;
		}
		return `${sourceFd}${operator}${this.serializeWord(redirection.target)}`;
	}

	private serializeWord(word: Word): string {
		return word.parts.map((part) => this.serializeWordPart(part)).join('');
	}

	private serializeWordPart(part: WordPart): string {
		switch (part.kind) {
			case 'literal':
				return part.value;
			case 'glob':
				return part.pattern;
			case 'commandSub':
				return `(${this.serializeProgram(part.program)})`;
			default: {
				const _exhaustive: never = part;
				throw new Error(
					`Unknown word part kind: ${JSON.stringify(_exhaustive)}`
				);
			}
		}
	}
}
