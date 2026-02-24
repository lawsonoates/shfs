import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileTest(cmd: SimpleCommandIR): StepIR {
	if (cmd.args.length === 0) {
		throw new Error('test requires operands');
	}

	return {
		cmd: 'test',
		args: {
			operands: [...cmd.args],
		},
	} as const;
}
