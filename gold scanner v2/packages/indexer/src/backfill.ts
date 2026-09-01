export type BlockRange = {
  from: number;
  to: number;
};

export class MissingRangeTracker {
  private readonly indexed = new Set<number>();

  markIndexed(blockNumber: number): void {
    this.indexed.add(blockNumber);
  }

  markRangeIndexed(from: number, to: number): void {
    for (let blockNumber = from; blockNumber <= to; blockNumber += 1) {
      this.markIndexed(blockNumber);
    }
  }

  getMissingRanges(upTo: number): BlockRange[] {
    if (upTo < 1) {
      return [];
    }

    const missing: BlockRange[] = [];
    let rangeStart: number | null = null;

    for (let blockNumber = 1; blockNumber <= upTo; blockNumber += 1) {
      if (!this.indexed.has(blockNumber)) {
        if (rangeStart === null) {
          rangeStart = blockNumber;
        }
        continue;
      }

      if (rangeStart !== null) {
        missing.push({ from: rangeStart, to: blockNumber - 1 });
        rangeStart = null;
      }
    }

    if (rangeStart !== null) {
      missing.push({ from: rangeStart, to: upTo });
    }

    return missing;
  }

  hasGap(): boolean {
    return this.getMissingRanges(Number.MAX_SAFE_INTEGER).length > 0;
  }

  getIndexedBlocks(): number[] {
    return [...this.indexed].sort((a, b) => a - b);
  }
}

export function mergeRanges(ranges: BlockRange[]): BlockRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: BlockRange[] = [{ ...sorted[0]! }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const last = merged[merged.length - 1]!;

    if (current.from <= last.to + 1) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}
