import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileRead(cmd: SimpleCommandIR): StepIR {
	if (cmd.args.length !== 1) {
		throw new Error('read requires exactly one variable name');
	}

	const name = cmd.args[0];
	if (!name) {
		throw new Error('read requires exactly one variable name');
	}

	return {
		cmd: 'read',
		args: { name },
	} as const;
}
