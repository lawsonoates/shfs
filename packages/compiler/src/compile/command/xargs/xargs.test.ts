import { expect, test } from 'bun:test';

import { cmd, literal, type XargsStep } from '@/ir';
import { compileXargs } from './xargs';

function mustBeXargsStep(step: ReturnType<typeof compileXargs>): XargsStep {
	if (step.cmd !== 'xargs') {
		throw new Error(`Expected xargs step, received ${step.cmd}`);
	}
	return step;
}

test('compileXargs: later -n clears earlier -L mode', () => {
	const step = mustBeXargsStep(
		compileXargs(cmd('xargs', [literal('-L2'), literal('-n1')]))
	);

	expect(step.args.maxArgs).toBe(1);
	expect(step.args.maxLines).toBeNull();
	expect(step.args.replace).toBeNull();
});

test('compileXargs: later -n clears earlier -I mode', () => {
	const step = mustBeXargsStep(
		compileXargs(cmd('xargs', [literal('-I{}'), literal('-n2')]))
	);

	expect(step.args.maxArgs).toBe(2);
	expect(step.args.maxLines).toBeNull();
	expect(step.args.replace).toBeNull();
});

test('compileXargs: later -I clears earlier -n mode', () => {
	const step = mustBeXargsStep(
		compileXargs(cmd('xargs', [literal('-n2'), literal('-I{}')]))
	);

	expect(step.args.maxArgs).toBeNull();
	expect(step.args.maxLines).toBe(1);
	expect(step.args.replace).toBe('{}');
});
