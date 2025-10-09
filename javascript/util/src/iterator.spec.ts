import { chunks, counts, sortBy, SortDirection, take } from "./iterator.js";

describe("chunks", () => {
  it("should chunk an array into groups of specified size", () => {
    const input = [1, 2, 3, 4, 5, 6, 7];
    const result = Array.from(chunks(input, 3), (chunk) => Array.from(chunk));
    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("should handle chunk size of 1", () => {
    const input = [1, 2, 3];
    const result = Array.from(chunks(input, 1), (chunk) => Array.from(chunk));
    expect(result).toEqual([[1], [2], [3]]);
  });

  it("should handle empty iterable", () => {
    const input: number[] = [];
    const result = Array.from(chunks(input, 3), (chunk) => Array.from(chunk));
    expect(result).toEqual([]);
  });

  it("should handle chunk size larger than iterable", () => {
    const input = [1, 2, 3];
    const result = Array.from(chunks(input, 10), (chunk) => Array.from(chunk));
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("should work with strings", () => {
    const input = "abcdefg";
    const result = Array.from(chunks(input, 2), (chunk) => Array.from(chunk));
    expect(result).toEqual([["a", "b"], ["c", "d"], ["e", "f"], ["g"]]);
  });

  it("should throw error for maxCount less than 1", () => {
    expect(() => {
      Array.from(chunks([1, 2, 3], 0));
    }).toThrow(
      "maxCount must be between 1 and Number.MAX_SAFE_INTEGER, inclusive",
    );

    expect(() => {
      Array.from(chunks([1, 2, 3], -1));
    }).toThrow(
      "maxCount must be between 1 and Number.MAX_SAFE_INTEGER, inclusive",
    );
  });

  it("should throw error for maxCount greater than MAX_SAFE_INTEGER", () => {
    expect(() => {
      Array.from(chunks([1, 2, 3], Number.MAX_SAFE_INTEGER + 1));
    }).toThrow(
      "maxCount must be between 1 and Number.MAX_SAFE_INTEGER, inclusive",
    );
  });

  it("should handle chunk size equal to array length", () => {
    const input = [1, 2, 3, 4, 5];
    const result = Array.from(chunks(input, 5), (chunk) => Array.from(chunk));
    expect(result).toEqual([[1, 2, 3, 4, 5]]);
  });

  it("should properly clean up iterator resources", () => {
    const mockReturn = jest.fn();
    const mockIterator = {
      next: jest
        .fn()
        .mockReturnValueOnce({ value: 1, done: false })
        .mockReturnValueOnce({ value: 2, done: false })
        .mockReturnValue({ done: true }),
      return: mockReturn,
    };
    const mockIterable = {
      [Symbol.iterator]: () => mockIterator,
    };

    Array.from(chunks(mockIterable, 2), (chunk) => Array.from(chunk));
    expect(mockReturn).toHaveBeenCalled();
  });
});

describe("counts", () => {
  it("should count occurrences of items", () => {
    const input = [1, 2, 3, 2, 1, 1, 4];
    const result = counts(input);
    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(2);
    expect(result.get(3)).toBe(1);
    expect(result.get(4)).toBe(1);
  });

  it("should handle empty iterable", () => {
    const input: number[] = [];
    const result = counts(input);
    expect(result.size).toBe(0);
  });

  it("should handle single item", () => {
    const input = [42];
    const result = counts(input);
    expect(result.get(42)).toBe(1);
  });

  it("should count string occurrences", () => {
    const input = ["a", "b", "a", "c", "a", "b"];
    const result = counts(input);
    expect(result.get("a")).toBe(3);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(1);
  });

  it("should handle all same items", () => {
    const input = [5, 5, 5, 5, 5];
    const result = counts(input);
    expect(result.get(5)).toBe(5);
    expect(result.size).toBe(1);
  });

  it("should work with Set as input", () => {
    const input = new Set([1, 2, 3]);
    const result = counts(input);
    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(1);
    expect(result.get(3)).toBe(1);
  });
});

describe("sortBy", () => {
  it("should sort by single key ascending", () => {
    const input = [{ age: 30 }, { age: 20 }, { age: 25 }];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.ASCENDING,
        key: (item) => item.age,
      }),
    );
    expect(result).toEqual([{ age: 20 }, { age: 25 }, { age: 30 }]);
  });

  it("should sort by single key descending", () => {
    const input = [{ age: 30 }, { age: 20 }, { age: 25 }];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.DESCENDING,
        key: (item) => item.age,
      }),
    );
    expect(result).toEqual([{ age: 30 }, { age: 25 }, { age: 20 }]);
  });

  it("should sort by multiple keys", () => {
    const input = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 30 },
    ];
    const result = Array.from(
      sortBy(
        input,
        {
          direction: SortDirection.ASCENDING,
          key: (item) => item.name,
        },
        {
          direction: SortDirection.ASCENDING,
          key: (item) => item.age,
        },
      ),
    );
    expect(result).toEqual([
      { name: "Alice", age: 25 },
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Bob", age: 30 },
    ]);
  });

  it("should handle empty iterable", () => {
    const input: { age: number }[] = [];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.ASCENDING,
        key: (item) => item.age,
      }),
    );
    expect(result).toEqual([]);
  });

  it("should handle single item", () => {
    const input = [{ age: 30 }];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.ASCENDING,
        key: (item) => item.age,
      }),
    );
    expect(result).toEqual([{ age: 30 }]);
  });

  it("should sort strings", () => {
    const input = ["banana", "apple", "cherry"];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.ASCENDING,
        key: (item) => item,
      }),
    );
    expect(result).toEqual(["apple", "banana", "cherry"]);
  });

  it("should sort numbers", () => {
    const input = [5, 2, 8, 1, 9];
    const result = Array.from(
      sortBy(input, {
        direction: SortDirection.ASCENDING,
        key: (item) => item,
      }),
    );
    expect(result).toEqual([1, 2, 5, 8, 9]);
  });

  it("should handle mixed direction keys", () => {
    const input = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 30 },
    ];
    const result = Array.from(
      sortBy(
        input,
        {
          direction: SortDirection.ASCENDING,
          key: (item) => item.name,
        },
        {
          direction: SortDirection.DESCENDING,
          key: (item) => item.age,
        },
      ),
    );
    expect(result).toEqual([
      { name: "Alice", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 30 },
      { name: "Bob", age: 25 },
    ]);
  });

  it("should handle equal values", () => {
    const input = [
      { name: "Alice", age: 30 },
      { name: "Alice", age: 30 },
    ];
    const result = Array.from(
      sortBy(
        input,
        {
          direction: SortDirection.ASCENDING,
          key: (item) => item.name,
        },
        {
          direction: SortDirection.ASCENDING,
          key: (item) => item.age,
        },
      ),
    );
    expect(result).toEqual([
      { name: "Alice", age: 30 },
      { name: "Alice", age: 30 },
    ]);
  });
});

describe("take", () => {
  it("should take first n items", () => {
    const input = [1, 2, 3, 4, 5];
    const result = Array.from(take(input, 3));
    expect(result).toEqual([1, 2, 3]);
  });

  it("should take all items if n is larger than iterable", () => {
    const input = [1, 2, 3];
    const result = Array.from(take(input, 10));
    expect(result).toEqual([1, 2, 3]);
  });

  it("should return empty for maxCount less than 1", () => {
    const input = [1, 2, 3];
    const result = Array.from(take(input, 0));
    expect(result).toEqual([]);
  });

  it("should return empty for negative maxCount", () => {
    const input = [1, 2, 3];
    const result = Array.from(take(input, -5));
    expect(result).toEqual([]);
  });

  it("should handle empty iterable", () => {
    const input: number[] = [];
    const result = Array.from(take(input, 3));
    expect(result).toEqual([]);
  });

  it("should take one item", () => {
    const input = [1, 2, 3, 4, 5];
    const result = Array.from(take(input, 1));
    expect(result).toEqual([1]);
  });

  it("should work with strings", () => {
    const input = "abcdefg";
    const result = Array.from(take(input, 3));
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("should work with generators", () => {
    function* generator() {
      yield 1;
      yield 2;
      yield 3;
      yield 4;
      yield 5;
    }
    const result = Array.from(take(generator(), 3));
    expect(result).toEqual([1, 2, 3]);
  });

  it("should stop early and not consume entire iterable", () => {
    const mockNext = jest.fn();
    let count = 0;
    function* generator() {
      while (true) {
        mockNext();
        yield count++;
      }
    }
    const result = Array.from(take(generator(), 3));
    expect(result).toEqual([0, 1, 2]);
    // Should have called next 3 times for yielding, not more
    expect(mockNext).toHaveBeenCalledTimes(3);
  });
});
