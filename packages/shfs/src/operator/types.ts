import type { ShellErrorCause, ShellResult } from '../diagnostics';
import type { Stream } from '../stream';

export type Transducer<I, O> = (input: Stream<I>) => Stream<O>;

export type Sink<I, R> = (input: Stream<I>) => Promise<R>;

export type ActionEffect<A = void> = (
	args: A
) => ShellResult<void, ShellErrorCause>;

export type Operator<I, O> = Transducer<I, O>;
