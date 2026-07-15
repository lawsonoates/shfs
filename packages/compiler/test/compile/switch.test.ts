import { expect, test } from 'bun:test';

import { compile } from '@/compile/compile';
import { literal, variable } from '@/ir';
import { parse } from '@/parser/parser';

test('compile preserves switch expansion, cases, and job metadata', () => {
	const ir = compile(
		parse(
			'mode=local not switch $mode\ncase red $fallback\n echo warm\ncase "*"\n echo other\nend'
		)
	);

	expect(ir.statements[0]).toMatchObject({
		assignments: [{ name: 'mode', value: literal('local') }],
		cases: [
			{
				patterns: [literal('red'), variable('fallback')],
				body: [{ kind: 'job' }],
			},
			{
				patterns: [literal('*')],
				body: [{ kind: 'job' }],
			},
		],
		chainMode: 'always',
		kind: 'switch',
		negated: true,
		value: variable('mode'),
	});
});
