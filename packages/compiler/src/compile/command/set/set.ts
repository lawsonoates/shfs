import { Effect } from 'effect';
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
	return Effect.runSync(compileSetEffect(cmd));
}

export const compileSetEffect: (
	cmd: SimpleCommandIR
) => Effect.Effect<StepIR, CompileError> = Effect.fn('Compiler.set')(
	function* (cmd) {
		const parsed = yield* parseSetArgs(cmd.args, {
			unknownFlagPolicy: 'error',
		}).pipe(
			Effect.mapError(
				(cause) =>
					new CompileError(
						createCommandDiagnostic(
							'set',
							'invalid-option',
							cause.message
						)
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

		return {
			cmd: 'set',
			args: {
				scope: isGlobal ? 'global' : 'local',
				name,
				values,
			},
		} as const;
	}
);
