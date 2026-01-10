import { expect, test } from 'bun:test';

import { tail } from './tail';

test('tail yields last n items from stream', async () => {
	const n = 2;

	async function* createNumberStream(): AsyncIterable<number> {
		yield 1;
		yield 2;
		yield 3;
		yield 4;
		yield 5;
	}

	const lastItems: number[] = [];
	const transducer = tail(n);
	for await (const item of transducer(createNumberStream())) {
		lastItems.push(item);
	}

	expect(lastItems).toEqual([4, 5]);
});
