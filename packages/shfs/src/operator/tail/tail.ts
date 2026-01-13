import type { LineRecord } from '../../record';
import type { Transducer } from '../types';

export function tail(n: number): Transducer<LineRecord, LineRecord> {
	return async function* (input) {
		const buf: LineRecord[] = [];
		for await (const x of input) {
			buf.push(x);
			if (buf.length > n) {
				buf.shift();
			}
		}
		yield* buf;
	};
}
