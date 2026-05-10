import { expect, test } from 'bun:test';
import { tail } from '../../../../packages/shfs/src/operator/tail/tail';
import type { LineRecord } from '../../../../packages/shfs/src/record';

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
