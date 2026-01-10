import type { Stream } from '../stream';

export type Producer<O> = () => Stream<O>;

export type Transducer<I, O> = (input: Stream<I>) => Stream<O>;

export type Sink<I, R> = (input: Stream<I>) => Promise<R>;
