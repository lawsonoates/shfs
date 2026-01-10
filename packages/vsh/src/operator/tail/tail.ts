import type { Transducer } from '../types';

export function tail<T>(n: number): Transducer<T, T> {
	return async function* (input) {
		const buf: T[] = [];
		for await (const x of input) {
			buf.push(x);
			if (buf.length > n) buf.shift();
		}
		yield* buf;
	};
}
