import type { Effect as EffectType } from 'effect';

import type { ShellErrorCause } from '../diagnostics';
import type { Stream } from '../stream';

export type Transducer<I, O> = (input: Stream<I>) => Stream<O>;

export type Sink<I, R> = (input: Stream<I>) => Promise<R>;

export type CommandEffect<A = void> = (
	args: A
) => EffectType.Effect<void, ShellErrorCause>;

export type Operator<I, O> = Transducer<I, O>;

export type EffectOperator<A = void> = CommandEffect<A>;
