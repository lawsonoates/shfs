import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileString(cmd: SimpleCommandIR): StepIR {
	const [subcommand, ...operands] = cmd.args;
	if (!subcommand) {
		throw new Error('string requires a subcommand');
	}

	return {
		cmd: 'string',
		args: {
			subcommand,
			operands,
		},
	} as const;
}
