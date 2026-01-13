import { expect, test } from 'bun:test';

import type { LineRecord } from '../../record';
import { tail } from './tail';

test('tail yields last n items from stream', async () => {
	const n = 2;

	async function* createLineStream(): AsyncIterable<LineRecord> {
		yield { kind: 'line', text: 'line 1' };
		yield { kind: 'line', text: 'line 2' };
		yield { kind: 'line', text: 'line 3' };
	}

	const lastItems: LineRecord[] = [];
	const transducer = tail(n);
	for await (const item of transducer(createLineStream())) {
		lastItems.push(item);
	}

	expect(lastItems).toEqual([
		{ kind: 'line', text: 'line 2' },
		{ kind: 'line', text: 'line 3' },
	]);
});
