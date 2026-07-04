/**
 * cat command handler for the AST-based compiler.
 */

import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	type ExpandedWord,
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { createArgParserEffect } from '../arg/parse';

const flags: Record<string, Flag> = {
	number: { short: 'n', takesValue: false },
	numberNonBlank: { short: 'b', takesValue: false },
	showAll: { short: 'A', takesValue: false },
	showEnds: { short: 'E', takesValue: false },
	showNonprinting: { short: 'v', takesValue: false },
	showTabs: { short: 'T', takesValue: false },
	squeezeBlank: { short: 's', takesValue: false },
};

const parseCatArgs = createArgParserEffect(flags);

/**
 * Compile a cat command from SimpleCommandIR to StepIR.
 */
export function compileCat(cmd: SimpleCommandIR): StepIR {
	const result = compileCatEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileCatEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		// Convert ExpandedWord[] to string[] for arg parsing
		const argStrings = cmd.args.map(expandedWordToString);

		const parsed = yield* Result.mapError(
			parseCatArgs(argStrings),
			(cause) =>
				new CompileError(
					createCommandDiagnostic(
						'cat',
						'invalid-option',
						cause.message
					)
				)
		);

		// Use parser positional indices to map back to original ExpandedWord args.
		const fileArgs: ExpandedWord[] = [];
		for (const positionalIndex of parsed.positionalIndices) {
			const arg = cmd.args[positionalIndex];
			if (arg !== undefined) {
				fileArgs.push(arg);
			}
		}

		const hasInputRedirection = cmd.redirections.some(
			(redirection) => redirection.kind === 'input'
		);
		const hasOutputRedirection = cmd.redirections.some(
			(redirection) => redirection.kind === 'output'
		);

		if (
			fileArgs.length === 0 &&
			!hasInputRedirection &&
			!hasOutputRedirection
		) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'cat',
					'missing-file',
					'cat requires at least one file'
				)
			);
		}

		return Result.ok({
			cmd: 'cat',
			args: {
				files: fileArgs,
				numberLines: parsed.flags.number === true,
				numberNonBlank: parsed.flags.numberNonBlank === true,
				showAll: parsed.flags.showAll === true,
				showEnds: parsed.flags.showEnds === true,
				showNonprinting: parsed.flags.showNonprinting === true,
				showTabs: parsed.flags.showTabs === true,
				squeezeBlank: parsed.flags.squeezeBlank === true,
			},
		} as const satisfies StepIR);
	});
