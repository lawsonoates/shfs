/**
 * AST-based compiler for the Fish subset parser.
 *
 * This compiler traverses the AST and produces script-level IR
 * with enhanced word expansion information.
 *
 * Statements compile recursively: jobs become pipelines of typed steps,
 * blocks and control flow compile to nested statement IR, and unknown
 * command names compile to call steps resolved at runtime (functions).
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../diagnostic';
import {
	type AssignmentIR,
	commandSub,
	compound,
	type ExpandedWord,
	type ExpandedWordPart,
	expandedWordHasCommandSub,
	expandedWordToString,
	glob,
	type IfBranchIR,
	literal,
	type PipelineIR,
	type RedirectionIR,
	type ScriptIR,
	type SimpleCommandIR,
	type SourceIR,
	type StatementIR,
	type StepIR,
	variable,
} from '../ir';
import {
	type Assignment,
	BeginStatement,
	BreakStatement,
	ContinueStatement,
	ForStatement,
	FunctionStatement,
	IfStatement,
	type Pipeline,
	type Program,
	type Redirection,
	ReturnStatement,
	type SimpleCommand,
	Statement,
	type StatementNode,
	WhileStatement,
	type Word,
	type WordPart,
} from '../parser/ast';
import { CommandHandler } from './command/handler';

/**
 * Compile a Program AST to a ScriptIR.
 *
 * @param program The parsed Program AST
 * @returns The compiled ScriptIR
 */
export function compile(program: Program): ScriptIR {
	const result = compileEffect(program);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileEffect: (
	program: Program
) => Result<ScriptIR, CompileError> = (program) => {
	const compiler = new ProgramCompiler();
	return compiler.compileProgram(program);
};

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
	compileProgram(node: Program): Result<ScriptIR, CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			return Result.ok({
				statements: yield* compiler.compileStatements(node.statements),
			});
		});
	}

	compileStatements(
		nodes: StatementNode[]
	): Result<StatementIR[], CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			const statements = new Array<StatementIR>(nodes.length);
			for (let index = 0; index < nodes.length; index++) {
				const node = nodes[index];
				if (node) {
					statements[index] = yield* compiler.compileStatement(node);
				}
			}
			return Result.ok(statements);
		});
	}

	/**
	 * Compile a statement node to StatementIR.
	 */
	compileStatement(node: StatementNode): Result<StatementIR, CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			if (node instanceof Statement) {
				return Result.ok<StatementIR>({
					chainMode: node.chainMode,
					kind: 'job',
					negated: node.negated,
					pipeline: yield* compiler.compilePipeline(node.pipeline),
				});
			}
			if (node instanceof IfStatement) {
				return Result.ok(yield* compiler.compileIfStatement(node));
			}
			if (node instanceof WhileStatement) {
				return Result.ok<StatementIR>({
					assignments: compiler.compileAssignments(node.assignments),
					body: yield* compiler.compileStatements(node.body),
					chainMode: node.chainMode,
					condition: yield* compiler.compileStatements(
						node.condition
					),
					kind: 'while',
					negated: node.negated,
				});
			}
			if (node instanceof ForStatement) {
				return Result.ok<StatementIR>({
					body: yield* compiler.compileStatements(node.body),
					chainMode: node.chainMode,
					kind: 'for',
					values: node.values.map((value) =>
						compiler.expandWord(value)
					),
					variable: node.variable,
				});
			}
			if (node instanceof BeginStatement) {
				return Result.ok<StatementIR>({
					assignments: compiler.compileAssignments(node.assignments),
					body: yield* compiler.compileStatements(node.body),
					chainMode: node.chainMode,
					kind: 'begin',
					negated: node.negated,
				});
			}
			if (node instanceof FunctionStatement) {
				return Result.ok<StatementIR>({
					argumentNames: node.argumentNames,
					body: yield* compiler.compileStatements(node.body),
					chainMode: node.chainMode,
					kind: 'function',
					name: node.name,
				});
			}
			if (node instanceof BreakStatement) {
				return Result.ok<StatementIR>({
					chainMode: node.chainMode,
					kind: 'break',
				});
			}
			if (node instanceof ContinueStatement) {
				return Result.ok<StatementIR>({
					chainMode: node.chainMode,
					kind: 'continue',
				});
			}
			if (node instanceof ReturnStatement) {
				return Result.ok<StatementIR>({
					chainMode: node.chainMode,
					kind: 'return',
					values: node.values.map((value) =>
						compiler.expandWord(value)
					),
				});
			}
			return yield* new CompileError(
				createCommandDiagnostic(
					'<statement>',
					'unknown-statement',
					'Unknown statement node'
				)
			);
		});
	}

	private compileIfStatement(
		node: IfStatement
	): Result<StatementIR, CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			const branches: IfBranchIR[] = [];
			for (const branch of node.branches) {
				branches.push({
					body: yield* compiler.compileStatements(branch.body),
					condition: yield* compiler.compileStatements(
						branch.condition
					),
				});
			}
			return Result.ok<StatementIR>({
				assignments: compiler.compileAssignments(node.assignments),
				branches,
				chainMode: node.chainMode,
				elseBody: node.elseBody
					? yield* compiler.compileStatements(node.elseBody)
					: null,
				kind: 'if',
				negated: node.negated,
			});
		});
	}

	/**
	 * Compile a Pipeline to a PipelineIR.
	 */
	compilePipeline(node: Pipeline): Result<PipelineIR, CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			const commands = new Array<SimpleCommandIR>(node.commands.length);
			for (let index = 0; index < node.commands.length; index++) {
				const command = node.commands[index];
				if (command) {
					commands[index] = compiler.compileSimpleCommand(command);
				}
			}

			// First command determines the source
			const firstCmd = commands[0];
			if (!firstCmd) {
				return yield* new CompileError(
					createCommandDiagnostic(
						'<pipeline>',
						'empty-pipeline',
						'Pipeline must contain at least one command'
					)
				);
			}
			const source = compiler.determineSource(firstCmd);

			// Compile each command to a step
			const steps = new Array<StepIR>(commands.length);
			for (let index = 0; index < commands.length; index++) {
				const command = commands[index];
				if (command) {
					steps[index] =
						yield* compiler.compileCommandToStep(command);
				}
			}

			return Result.ok({
				source,
				steps,
				firstCommand: firstCmd,
			});
		});
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
			assignments: this.compileAssignments(node.assignments),
		};
	}

	compileAssignments(assignments: readonly Assignment[]): AssignmentIR[] {
		return assignments.map((assignment) => ({
			name: assignment.name,
			value: this.expandWord(assignment.value),
		}));
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
			case 'commandSub':
				return commandSub(part.source, [], {
					index: part.index,
					quoted: part.quoted,
				});
			case 'variable':
				return variable(part.name, {
					index: part.index,
					quoted: part.quoted,
				});
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
	 *
	 * Known commands compile to typed steps; unknown command names become
	 * call steps that resolve against runtime-defined functions.
	 */
	private compileCommandToStep(
		cmd: SimpleCommandIR
	): Result<StepIR, CompileError> {
		const compiler = this;
		return Result.gen(function* () {
			const cmdName = compiler.extractLiteralString(cmd.name);
			if (!cmdName) {
				return yield* new CompileError(
					createCommandDiagnostic(
						'<command>',
						'command-name-not-literal',
						'Command name must be a literal string'
					)
				);
			}

			if (!CommandHandler.has(cmdName)) {
				return Result.ok<StepIR>({
					args: {
						name: cmdName,
						words: [...cmd.args],
					},
					assignments: cmd.assignments,
					cmd: 'call',
					redirections: cmd.redirections,
				});
			}

			const handler = yield* CommandHandler.get(cmdName);
			const step = yield* handler(cmd);
			return Result.ok({
				...step,
				assignments: cmd.assignments,
				redirections: cmd.redirections,
			});
		});
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
}
