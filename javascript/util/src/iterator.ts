/**
 * Sliding window
 */
export function* batch<T>(
  iterable: Iterable<T>,
  maxCount: number,
): IterableIterator<T[]> {
  let buffer: T[] = [];
  for (const item of iterable) {
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
