import { type Record, recordsToBytes } from '../record';
import type { Stream } from '../stream';

/**
 * A Consumer terminates a stream.
 * It pulls values and produces a final result or side-effect.
 */
export type Consumer<T, R = void> = (input: Stream<T>) => Promise<R>;

/**
 * Collects the entire stream into memory.
 * Pure from an API perspective.
 */
export function collect<T>(): Consumer<T, T[]> {
	return async (input) => {
		const out: T[] = [];
		for await (const item of input) {
			out.push(item);
		}
		return out;
	};
}

/**
 * Streams records directly to stdout.
 * Side-effecting, non-buffering.
 */
export function stdout(): Consumer<Record> {
	return async (input) => {
		for await (const record of input) {
			process.stdout.write(
				recordsToBytes([record], { trailingNewline: true })
			);
		}
	};
}
