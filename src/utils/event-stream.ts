export type EventStreamListener<T> = (event: T) => void;

export class EventStream<T, R> {
  private listeners: Set<EventStreamListener<T>> = new Set();
  private buffer: T[] = [];
  private isEnded = false;
  private resultPromise: Promise<R>;
  private resolveResult!: (value: R) => void;
  private rejectResult!: (reason?: any) => void;

  constructor(
    private endCondition: (event: T) => boolean,
    private resultMapper: (event: T) => R,
  ) {
    this.resultPromise = new Promise<R>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  push(event: T) {
    if (this.isEnded) return;
    this.buffer.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
    if (this.endCondition(event)) {
      this.end(this.resultMapper(event));
    }
  }

  end(result: R) {
    if (this.isEnded) return;
    this.isEnded = true;
    this.resolveResult(result);
  }

  error(err: any) {
    if (this.isEnded) return;
    this.isEnded = true;
    this.rejectResult(err);
  }

  subscribe(listener: EventStreamListener<T>): () => void {
    this.listeners.add(listener);
    for (const event of this.buffer) {
      listener(event);
    }
    return () => this.listeners.delete(listener);
  }

  async result(): Promise<R> {
    return this.resultPromise;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let index = 0;
    while (!this.isEnded || index < this.buffer.length) {
      if (index < this.buffer.length) {
        yield this.buffer[index++];
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }
}
