import type { SimpleCommandIR, StepIR } from '../../../ir';

export function compileEcho(cmd: SimpleCommandIR): StepIR {
	return {
		cmd: 'echo',
		args: { values: [...cmd.args] },
	} as const;
}
