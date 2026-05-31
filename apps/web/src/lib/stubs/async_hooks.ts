/** Browser-safe stub when Toolkit pulls in @api/pipeline/sectorConfig (Node logger). */
export class AsyncLocalStorage<T> {
  getStore(): T | undefined {
    return undefined;
  }
  run<R>(_store: T, callback: (...args: never[]) => R, ...args: never[]): R {
    return callback(...args);
  }
}
