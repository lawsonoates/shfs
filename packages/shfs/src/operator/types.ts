import type { Stream } from '../stream';

export type Transducer<I, O> = (input: Stream<I>) => Stream<O>;

export type Sink<I, R> = (input: Stream<I>) => Promise<R>;

export type Effect<A = void> = (args: A) => Promise<void>;
