/**
 * Sliding window
 */
export function* chunks<T>(
  iterable: Iterable<T>,
  maxCount: number,
): IterableIterator<IterableIterator<T>> {
  if (!(1 <= maxCount && maxCount <= Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      "maxCount must be between 1 and Number.MAX_SAFE_INTEGER, inclusive",
    );
  }
  const iterator = iterable[Symbol.iterator]();
  try {
    for (
      let result: IteratorResult<T> | undefined;
      !(result ??= iterator.next()).done;

    ) {
      let remaining = maxCount;
      yield (function* () {
        while (!result.done) {
          const value = result.value;
          result = undefined;
          yield value;
          if (--remaining < 1) {
            break;
          }
          result = iterator.next();
        }
      })();
      remaining = 0;
    }
  } finally {
    iterator.return?.();
  }
}

function compare(a: any, b: any): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function counts<T>(iterable: Iterable<T>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of iterable) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

export enum SortDirection {
  ASCENDING = 1,
  DESCENDING = -1,
}

export interface SortKey<T> {
  direction: SortDirection;
  key: (item: T) => any;
}

export function sortBy<T>(
  iterable: Iterable<T>,
  ...keys: SortKey<T>[]
): Iterable<T> {
  const array = Array.from(iterable, (item) => ({
    item,
    keys: keys.map((key) => key.key(item)),
  }));
  return Array.from(
    array.sort((a, b) => {
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        const result = compare(a.keys[keyIndex], b.keys[keyIndex]);
        if (result) {
          return result * keys[keyIndex].direction;
        }
      }
      return 0;
    }),
    (item) => item.item,
  );
}

export function* take<T>(iterable: Iterable<T>, maxCount: number): Iterable<T> {
  if (maxCount < 1) {
    return;
  }
  for (const item of iterable) {
    yield item;
    if (--maxCount < 1) {
      break;
    }
  }
}
