/**
 * Sliding window
 */
export async function* asyncBatch<T>(
  iterable: AsyncIterable<T>,
  maxCount: number,
): AsyncIterableIterator<T[]> {
  let buffer: T[] = [];
  for await (const item of iterable) {
    buffer.push(item);
    if (maxCount <= buffer.length) {
      yield buffer;
      buffer = [];
    }
  }
  if (buffer.length) {
    yield buffer;
  }
}
