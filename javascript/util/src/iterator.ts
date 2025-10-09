/**
 * Sliding window
 */
export function* chunks<T>(
  iterable: Iterable<T>,
  maxCount: number,
): IterableIterator<IterableIterator<T>> {
  if (!(1 <= maxCount && maxCount <= Number.MAX_SAFE_INTEGER)) {
    throw new Error("maxCount must be between 1 and Number.MAX_SAFE_INTEGER, inclusive");
  }
  const iterator = iterable[Symbol.iterator]();
  try {
    for (
      let result: IteratorResult<T> | undefined;
      result || !(result = iterator.next()).done;

    ) {
      let remaining = maxCount;
      yield (function* () {
        yield result.value;
        while (0 < --remaining) {
          result = iterator.next();
          if (result.done) {
            break;
          }
          yield result.value;
        }
      })();
      remaining = 0;
    }
  } finally {
    iterator.return?.();
  }
}
