import { Result } from 'better-result';
import { CompileError, createCommandDiagnostic } from '../../../diagnostic';
import {
	expandedWordToString,
	type SimpleCommandIR,
	type StepIR,
} from '../../../ir';
import type { Flag } from '../arg/flag';
import { createWordParserEffect } from '../arg/parse';

const flags: Record<string, Flag> = {
	global: { short: 'g', takesValue: false },
	local: { short: 'l', takesValue: false },
};

const parseSetArgs = createWordParserEffect(flags, expandedWordToString);

export function compileSet(cmd: SimpleCommandIR): StepIR {
	const result = compileSetEffect(cmd);
	if (Result.isError(result)) {
		throw result.error;
	}
	return result.value;
}

export const compileSetEffect: (
	cmd: SimpleCommandIR
) => Result<StepIR, CompileError> = (cmd) =>
	Result.gen(function* () {
		const parsed = yield* Result.mapError(
			parseSetArgs(cmd.args, {
				unknownFlagPolicy: 'error',
			}),
			(cause) =>
				new CompileError(
					createCommandDiagnostic(
						'set',
						'invalid-option',
						cause.message
					)
				)
		);
		const isGlobal = parsed.flags.global === true;
		const isLocal = parsed.flags.local === true;
		if (isGlobal === isLocal) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'set',
					'invalid-scope',
					'set requires exactly one scope flag: -g or -l'
				)
			);
		}

		const [name, ...values] = parsed.positionalWords;
		if (!name) {
			return yield* new CompileError(
				createCommandDiagnostic(
					'set',
					'missing-variable',
					'set requires a variable name'
				)
			);
		}

		return Result.ok({
			cmd: 'set',
			args: {
				scope: isGlobal ? 'global' : 'local',
				name,
				values,
			},
		} as const satisfies StepIR);
	});
