import { describe, expect, it } from "vitest"; // Adjust if using Jest
import { SegmentedArray } from "~util/datastructures/SegmentedArray";
import type {
	NumberTypedArray,
	TypedArrayConstructor,
} from "~util/TypedArrays";

function build<T extends NumberTypedArray>({
	segments,
	itemLength,
	constructor,
	resizableBuffer = false,
	initialItemCapacity = 0,
	maxItems = 0,
	growthFactor,
}: {
	segments: number;
	itemLength: number;
	constructor: TypedArrayConstructor<T>;
	resizableBuffer?: boolean;
	initialItemCapacity?: number;
	maxItems?: number;
	growthFactor?: number;
}) {
	const options = resizableBuffer
		? { initialItemCapacity, resizable: { maxItems }, growthFactor }
		: { initialItemCapacity, growthFactor };

	return [
		SegmentedArray.create(constructor, itemLength, segments, options),
		constructor.BYTES_PER_ELEMENT,
	] as const;
}

interface BufferSettings {
	title: string;
	resizableBuffer: boolean;
	initialItemCapacity: number;
	maxItems?: number;
}

const BUFFER_SETTINGS: BufferSettings[] = [
	{
		title: "classic (fixed ArrayBuffer)",
		resizableBuffer: false,
		initialItemCapacity: 0,
	},
	{
		title: "resizable (resizable ArrayBuffer)",
		resizableBuffer: true,
		initialItemCapacity: 1, // force growth easily
		maxItems: 10_000,
	},
];

/** Helper: current data-buffer byteLength (capacity in bytes). */
function bufBytes<T extends Uint16Array>(sa: SegmentedArray<T>): number {
	return (sa.flatDataView().buffer as ArrayBuffer).byteLength;
}

/**
 * --------------- Constructor & static create ---------------
 */
describe("SegmentedArray: create", () => {
	it("creates with valid parameters", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 3,
			resizableBuffer: false,
			initialItemCapacity: 10,
		});
		expect(array.maxSegments).toBe(3);
		expect(array.itemLength).toBe(3);
		expect(array.sizeElements).toBe(0);
		expect(array.sizeItems).toBe(0);
		expect(array.sizeSegments).toBe(0);
	});

	it("throws RangeError for negative segments", () => {
		expect(() => SegmentedArray.create(Uint16Array, 2, -1)).toThrow(
			RangeError
		);
	});

	it("throws RangeError for itemLength < 1", () => {
		expect(() => SegmentedArray.create(Uint16Array, 0, 1)).toThrow(
			RangeError
		);
	});

	it("accepts negative initialCapacityInItems by clamping to 0", () => {
		const array = SegmentedArray.create(Uint16Array, 1, 2, {
			initialItemCapacity: -100,
		});
		expect(array.sizeElements).toBe(0);
	});

	it("constructs with resizable buffer options (sanity) when supported", () => {
		const array = SegmentedArray.create(Uint16Array, 1, 3, {
			initialItemCapacity: 0,
			resizable: { maxItems: 100 },
		});
		expect(array.sizeElements).toBe(0);
		expect(array.maxSegments).toBe(3);
	});
});

/**
 * --------------- Getters ---------------
 */
describe("SegmentedArray: getters reflect state", () => {
	it("bytesAllocated and sizes update after writes", () => {
		for (const be of BUFFER_SETTINGS) {
			const [array] = build({
				constructor: Uint16Array,
				segments: 1,
				itemLength: 3,
				resizableBuffer: be.resizableBuffer,
				initialItemCapacity: be.initialItemCapacity,
				maxItems: be.maxItems,
			});
			const before = array.bytesAllocated;

			array.beginSegment();
			array.pushItem([1, 2, 3]);
			array.endSegment();

			expect(array.bytesAllocated).toBeGreaterThanOrEqual(before);
			expect(array.sizeSegments).toBe(1);
			expect(array.sizeElements).toBe(3);
			expect(array.sizeItems).toBe(1);
		}
	});
});

/**
 * --------------- beginSegment / endSegment ---------------
 */
describe("SegmentedArray: beginSegment / endSegment", () => {
	it("enforces open/close discipline and segment bounds", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});

		array.beginSegment();
		expect(() => array.segmentLength(0)).toThrow(); // not finalized
		expect(() => {
			array.beginSegment();
		}).toThrow(); // already in a segment
		array.pushItem([1, 2]);
		array.endSegment();

		expect(array.segmentLength(0)).toBe(1);

		array.beginSegment();
		array.pushItem([3, 4]);
		array.endSegment();
		expect(array.sizeSegments).toBe(2);

		expect(() => {
			array.beginSegment();
		}).toThrow(RangeError); // exceeded segments
	});

	it("endSegment throws if beginSegment not called", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 1,
		});
		expect(() => {
			array.endSegment();
		}).toThrow();
	});
});

/**
 * --------------- pushItem / pushItemData ---------------
 */
describe("SegmentedArray: pushItem / pushItemData", () => {
	it("appends correctly and updates sizes/content", () => {
		for (const bufferSettings of BUFFER_SETTINGS) {
			const [array] = build({
				constructor: Uint16Array,
				segments: 1,
				itemLength: 3,
				resizableBuffer: bufferSettings.resizableBuffer,
				initialItemCapacity: bufferSettings.initialItemCapacity,
				maxItems: bufferSettings.maxItems,
			});

			array.beginSegment();
			array.pushItem([1, 2, 3]);
			array.pushItemData(new Uint16Array([4, 5, 6, 7, 8, 9]));
			array.endSegment();

			expect(array.sizeItems).toBe(3);
			expect(array.segmentLength(0)).toBe(3);
			expect(Array.from(array.segmentDataView(0))).toEqual([
				1, 2, 3, 4, 5, 6, 7, 8, 9,
			]);
		}
	});

	it("throws outside a segment", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		expect(() => {
			array.pushItem([1, 2]);
		}).toThrow();
		expect(() => {
			array.pushItemData(new Uint16Array([1, 2]));
		}).toThrow();
	});

	it("validates item length and block multiple", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 3,
		});
		array.beginSegment();
		expect(() => {
			array.pushItem([1, 2]);
		}).toThrow(RangeError); // short
		expect(() => {
			array.pushItem([1, 2, 3, 4]);
		}).toThrow(RangeError); // long
		expect(() => {
			array.pushItemData([1, 2, 3, 4]);
		}).toThrow(RangeError); // not multiple
		array.endSegment();
	});
});

/**
 * --------------- pushSegment ---------------
 */
describe("SegmentedArray: pushSegment", () => {
	it("appends a full segment successfully", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 3,
		});

		// 2 items of length 3
		array.pushSegment([1, 2, 3, 4, 5, 6]);

		expect(array.sizeSegments).toBe(1);
		expect(array.segmentLength(0)).toBe(2);
		expect(Array.from(array.segmentDataView(0))).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
	});

	it("creates an empty segment when given zero-length data", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 3,
		});

		array.pushSegment([]); // empty segment

		expect(array.sizeSegments).toBe(1);
		expect(array.segmentLength(0)).toBe(0);
		expect(Array.from(array.segmentDataView(0))).toEqual([]);
	});

	it("rejects non-multiple-of-itemLength without side effects", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 3,
		});

		expect(array.sizeSegments).toBe(0);
		const beforeSize = array.sizeElements;

		// 4 is not a multiple of itemLength=3
		expect(() => {
			array.pushSegment([1, 2, 3, 4]);
		}).toThrow(RangeError);

		// No segment was opened/closed; nothing was written
		expect(array.sizeSegments).toBe(0);
		expect(array.sizeElements).toBe(beforeSize);

		// Should still be usable:
		array.pushSegment([7, 8, 9]); // one item
		expect(array.sizeSegments).toBe(1);
		expect(array.segmentLength(0)).toBe(1);
		expect(Array.from(array.segmentDataView(0))).toEqual([7, 8, 9]);
	});

	it("Resizable Buffer: exceeding maxItems throws and the operation rolls back", () => {
		// itemLength=2 → maxElements = maxItems * 2
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 0,
			maxItems: 10, // maxElements = 20
		});

		// Try to append 22 elements = 11 items -> exceeds maxItems=10
		expect(() => {
			array.pushSegment(new Uint16Array(22));
		}).toThrow(RangeError);

		// Atomic: no partial open/close, no writes
		expect(array.sizeSegments).toBe(0);
		expect(array.sizeElements).toBe(0);

		// Still usable: push exactly at the cap (20 elements = 10 items)
		array.pushSegment(new Uint16Array(20));
		expect(array.sizeSegments).toBe(1);
		expect(array.segmentLength(0)).toBe(10);
		expect(Array.from(array.segmentDataView(0))).toHaveLength(20);
	});
});

/**
 * --------------- pushFrom ---------------
 */
describe("SegmentedArray: pushFrom", () => {
	it("appends all finalized segments from source, preserving boundaries and order", () => {
		// Destination (classic or resizable) — test both flavors using existing matrix
		for (const bufferSettings of BUFFER_SETTINGS) {
			const [dest] = build({
				constructor: Uint16Array,
				segments: 5, // enough slots
				itemLength: 2,
				resizableBuffer: bufferSettings.resizableBuffer,
				initialItemCapacity: bufferSettings.initialItemCapacity,
				maxItems: bufferSettings.maxItems,
			});

			// Source with three finalized segments: [ [1,2,3,4], [], [5,6] ]
			const [source] = build({
				constructor: Uint16Array,
				segments: 3,
				itemLength: 2,
				resizableBuffer: true,
				initialItemCapacity: 1,
				maxItems: 1000,
			});
			source.pushSegment([1, 2, 3, 4]); // 2 items
			source.pushSegment([]); // empty
			source.pushSegment([5, 6]); // 1 item

			// Also put something in dest before appending to ensure append behavior
			dest.pushSegment([9, 9]); // 1 item

			// Append
			dest.pushFrom(source);

			// Dest now has 1 (existing) + 3 (from source) = 4 segments
			expect(dest.sizeSegments).toBe(4);
			expect(dest.segmentLength(0)).toBe(1); // original
			expect(dest.segmentLength(1)).toBe(2);
			expect(dest.segmentLength(2)).toBe(0);
			expect(dest.segmentLength(3)).toBe(1);

			const segmentsAsArrays = Array.from(dest.segmentDataViews()).map(
				(v) => Array.from(v)
			);
			expect(segmentsAsArrays).toEqual([
				[9, 9],
				[1, 2, 3, 4],
				[],
				[5, 6],
			]);
		}
	});

	it("throws if destination has an open segment", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
		});
		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		source.pushSegment([1, 2]);

		dest.beginSegment(); // open
		expect(() => {
			dest.pushFrom(source);
		}).toThrow();
	});

	it("throws if source has an open segment", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
		});
		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		source.beginSegment();
		source.pushItem([1, 2]); // open, not closed

		expect(() => {
			dest.pushFrom(source);
		}).toThrow();
	});

	it("throws if TypedArray constructors differ", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});
		const [source] = build({
			constructor: Uint32Array, // mismatch
			segments: 1,
			itemLength: 2,
		});
		source.pushSegment([1, 2]);

		expect(() => {
			// @ts-expect-error expected
			dest.pushFrom(source);
		}).toThrow(Error);
	});

	it("throws if itemLength differs", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});
		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 3, // mismatch
		});
		source.pushSegment([1, 2, 3]);

		expect(() => {
			dest.pushFrom(source);
		}).toThrow(Error);
	});

	it("throws if not enough remaining segment slots in destination", () => {
		// Destination has only 1 slot, already used; cannot append 1 more from source
		const [dest] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		dest.pushSegment([9, 9]); // use the only slot

		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		source.pushSegment([1, 2]);

		expect(() => {
			dest.pushFrom(source);
		}).toThrow(RangeError);
	});

	it("resizable buffer destination: growth preserves buffer identity; data appended", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 1, // tiny, so append triggers resize
			maxItems: 10_000,
		});

		// Start with a small segment so we have an initial buffer/view to compare
		dest.pushSegment([9, 9]);
		const oldFlat = dest.flatDataView();
		const oldBuffer = oldFlat.buffer;

		// Source with a larger segment to force capacity growth in dest
		const [source] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 8,
		});
		source.pushSegment([1, 2, 3, 4, 5, 6]); // 3 items
		source.pushSegment([]); // empty

		dest.pushFrom(source);

		// Same buffer identity (resizable growth)
		const newFlat = dest.flatDataView();
		expect(newFlat.buffer).toBe(oldBuffer);

		// Data layout preserved
		const segments = Array.from(dest.segmentDataViews()).map((v) =>
			Array.from(v)
		);
		expect(segments).toEqual([[9, 9], [1, 2, 3, 4, 5, 6], []]);
	});

	it("resizable buffer destination: exceeding maxItems throws and leaves state unchanged", () => {
		// Destination cap: maxItems=3, itemLength=2 → maxElements=6
		const [dest] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 0,
			maxItems: 3,
		});

		// Source requires 8 elements (4 items) → exceeds maxElements=6
		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		source.pushSegment([1, 2, 3, 4, 5, 6, 7, 8]);

		const beforeClosed = dest.sizeSegments;
		const beforeSize = dest.sizeElements;
		const beforeBytes = bufBytes(dest);

		expect(() => {
			dest.pushFrom(source);
		}).toThrow(RangeError);

		// State unchanged
		expect(dest.sizeSegments).toBe(beforeClosed);
		expect(dest.sizeElements).toBe(beforeSize);
		expect(bufBytes(dest)).toBe(beforeBytes);
	});

	it("classic buffer destination: growth swaps buffer; old views remain valid", () => {
		const [dest] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 1, // force growth
		});

		// initial segment and view
		dest.pushSegment([9, 9]);
		const oldFlat = dest.flatDataView();
		const oldBuffer = oldFlat.buffer;

		// source will trigger growth when appended
		const [source] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		source.pushSegment([1, 2, 3, 4, 5, 6]); // 3 items

		dest.pushFrom(source);

		// Classic growth → different buffer
		const newFlat = dest.flatDataView();
		expect(newFlat.buffer).not.toBe(oldBuffer);

		// Old view is still readable (into the old buffer)
		expect(Array.from(oldFlat)).toEqual([9, 9]);

		// New data is present in destination
		const segments = Array.from(dest.segmentDataViews()).map((v) =>
			Array.from(v)
		);
		expect(segments).toEqual([
			[9, 9],
			[1, 2, 3, 4, 5, 6],
		]);
	});
});

/**
 * --------------- segmentLength / segmentDataView / segmentDataCopy ---------------
 */
describe("SegmentedArray: segmentLength / segmentDataView / segmentDataCopy", () => {
	it("returns correct lengths and content; copy vs view semantics", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});

		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.endSegment();

		array.beginSegment();
		array.pushItemData([5, 6, 7, 8, 9, 10]);
		array.endSegment();

		expect(array.segmentLength(0)).toBe(2);
		expect(array.segmentLength(1)).toBe(3);

		expect(Array.from(array.segmentDataView(0))).toEqual([1, 2, 3, 4]);
		expect(Array.from(array.segmentDataView(1))).toEqual([
			5, 6, 7, 8, 9, 10,
		]);

		const copy = array.segmentDataCopy(1);
		expect(Array.from(copy)).toEqual([5, 6, 7, 8, 9, 10]);
		copy[0] = 999;
		expect(Array.from(array.segmentDataView(1))).toEqual([
			5, 6, 7, 8, 9, 10,
		]); // unaffected

		const view = array.segmentDataView(0);
		view[1] = 42;
		expect(Array.from(array.segmentDataView(0))).toEqual([1, 42, 3, 4]); // underlying changed
	});

	it("throws when segment not finalized or out of bounds", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});

		array.beginSegment();
		array.pushItem([1, 2]);

		expect(() => array.segmentDataView(0)).toThrow();
		expect(() => array.segmentDataCopy(0)).toThrow();
		expect(() => array.segmentLength(0)).toThrow();

		array.endSegment();
		expect(() => array.segmentDataView(1)).toThrow(RangeError);
	});
});

/**
 * --------------- segmentDataViews / segmentDataCopies / default iterator ---------------
 */
describe("SegmentedArray: segmentDataViews / segmentDataCopies / [Symbol.iterator]", () => {
	it("yields all finalized segments as views; default iterator is equivalent", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
		});

		// Only 2 finalized segments:
		array.beginSegment();
		array.pushItemData([1, 2, 3, 4]);
		array.endSegment();

		array.beginSegment();
		array.pushItemData([5, 6]);
		array.endSegment();

		// Third segment not started/closed.

		const views = Array.from(array.segmentDataViews()).map((v) =>
			Array.from(v)
		);
		const iterViews = Array.from(array).map((v) => Array.from(v));

		expect(views).toEqual([
			[1, 2, 3, 4],
			[5, 6],
		]);
		expect(iterViews).toEqual(views);

		// Mutating a yielded view mutates the data:
		const view0 = array.segmentDataView(0);
		view0[0] = 11;
		const viewsAfter = Array.from(array.segmentDataViews()).map((v) =>
			Array.from(v)
		);
		expect(viewsAfter[0]).toEqual([11, 2, 3, 4]);
	});

	it("yields copies as independent arrays for segmentDataCopies()", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});

		array.beginSegment();
		array.pushItemData([1, 2, 3, 4]);
		array.endSegment();

		const copies = Array.from(array.segmentDataCopies());
		expect(copies.length).toBe(1);
		expect(Array.from(copies[0])).toEqual([1, 2, 3, 4]);

		// Modify the copy — should not affect the original
		copies[0][0] = 99;
		expect(Array.from(array.segmentDataView(0))).toEqual([1, 2, 3, 4]);
	});
});

/**
 * --------------- segmentView / segmentViews ---------------
 */
describe("SegmentedArray: segmentView / segmentViews", () => {
	it("creates SegmentView and supports item reads/writes", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 3,
		});

		array.beginSegment();
		array.pushItemData([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		array.endSegment();

		const sv = array.segmentView(0);
		expect(sv.length).toBe(3);

		expect(sv.getItemCopy(1)).toEqual([4, 5, 6]);

		// setItem mutates underlying data
		sv.setItem(1, [10, 11, 12]);
		expect(Array.from(array.segmentDataView(0))).toEqual([
			1, 2, 3, 10, 11, 12, 7, 8, 9,
		]);

		// bounds checks
		expect(() => sv.getItemCopy(3)).toThrow(RangeError);
		expect(() => {
			sv.setItem(3, [0, 0, 0]);
		}).toThrow(RangeError);
		expect(() => {
			sv.setItem(0, [1, 2]);
		}).toThrow(RangeError);
	});

	it("iterates SegmentView per finalized segment", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});

		array.beginSegment();
		array.pushItem([1, 2]);
		array.endSegment();

		array.beginSegment();
		array.pushItem([3, 4]);
		array.endSegment();

		const views = Array.from(array.segmentViews());
		expect(views.length).toBe(2);
		expect(views[0].length).toBe(1);
		expect(Array.from(views[0].getItemView(0))).toEqual([1, 2]);
		expect(Array.from(views[1].getItemView(0))).toEqual([3, 4]);
	});
});

/**
 * --------------- segmentItemViews / segmentItemCopies ---------------
 */
describe("SegmentedArray: segmentItemViews / segmentItemCopies", () => {
	it("yields per-item typed array views of correct length & order", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		array.pushItemData([1, 2, 3, 4, 5, 6]);
		array.endSegment();

		const itemViews = Array.from(array.segmentItemViews(0));
		expect(itemViews.length).toBe(3);
		expect(Array.from(itemViews[0])).toEqual([1, 2]);
		expect(Array.from(itemViews[1])).toEqual([3, 4]);
		expect(Array.from(itemViews[2])).toEqual([5, 6]);

		// Mutate a view → underlying data changes
		itemViews[1][0] = 99;
		expect(Array.from(array.segmentDataView(0))).toEqual([
			1, 2, 99, 4, 5, 6,
		]);
	});

	it("yields per-item copies as independent arrays", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		array.pushItemData([1, 2, 3, 4]);
		array.endSegment();

		const copies = Array.from(array.segmentItemCopies(0));
		expect(copies.length).toBe(2);
		expect(copies[0]).toEqual([1, 2]);
		expect(copies[1]).toEqual([3, 4]);

		copies[0][0] = 100;
		expect(Array.from(array.segmentDataView(0))).toEqual([1, 2, 3, 4]); // unchanged
	});

	it("throws when segment is not finalized or out of boundary", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});

		array.beginSegment();
		expect(() => Array.from(array.segmentItemViews(0))).toThrow();
		expect(() => Array.from(array.segmentItemCopies(0))).toThrow();
		array.endSegment();

		expect(() => Array.from(array.segmentItemViews(1))).toThrow(RangeError);
	});
});

/**
 * --------------- getItem / setItem ---------------
 */
describe("SegmentedArray: getItem / setItem", () => {
	it("reads and writes item via convenience methods", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.endSegment();

		expect(array.getItem(0, 1)).toEqual([3, 4]);
		array.setItem(0, 1, [30, 40]);
		expect(Array.from(array.segmentDataView(0))).toEqual([1, 2, 30, 40]);
	});

	it("throws for bad indices or not finalized segment", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		array.pushItem([1, 2]);
		expect(() => array.getItem(0, 0)).toThrow();
		expect(() => {
			array.setItem(0, 0, [1, 2]);
		}).toThrow();
		array.endSegment();
		expect(() => array.getItem(0, 2)).toThrow(RangeError);
	});
});

/**
 * --------------- flatDataView ---------------
 */
describe("SegmentedArray: flatDataView", () => {
	it("returns a zero-copy view of all finalized segments; excludes any open segment", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 8,
		});

		// Segment 0 (finalized)
		array.beginSegment();
		array.pushItemData([1, 2, 3, 4]); // 2 items
		array.endSegment();

		// Segment 1 (currently open)
		array.beginSegment();
		array.pushItem([5, 6]); // do not end yet

		const flatBefore = array.flatDataView();
		expect(Array.from(flatBefore)).toEqual([1, 2, 3, 4]); // excludes open segment

		// Finalize segment 1 and add segment 2
		array.endSegment();
		array.pushSegment([7, 8]); // segment 2

		const flatAfter = array.flatDataView();
		expect(Array.from(flatAfter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it("classic buffer growth: older flat view remains valid but detached from later growth", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 1, // force growth
		});

		// First segment
		array.pushSegment([1, 2]); // closed

		// Capture flat view before growth
		const flat1 = array.flatDataView();
		const flat1Buf = flat1.buffer;
		expect(Array.from(flat1)).toEqual([1, 2]);

		// Second segment triggers growth of classic buffer
		array.pushSegment([3, 4, 5, 6]); // 2 items

		// New flat view reflects additional data and likely a new buffer
		const flat2 = array.flatDataView();
		expect(Array.from(flat2)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(flat2.buffer).not.toBe(flat1Buf); // classic growth swaps buffers

		// Old flat view still valid, unchanged
		expect(Array.from(flat1)).toEqual([1, 2]);
	});

	it("resizable buffer growth: buffer identity preserved; older flat view keeps its length", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 1,
			maxItems: 10_000,
		});

		array.pushSegment([1, 2]); // first, closed

		const flat1 = array.flatDataView();
		const flat1Buf = flat1.buffer;
		expect(Array.from(flat1)).toEqual([1, 2]);

		// Append lots to trigger buffer.resize
		array.pushSegment(new Uint16Array(6)); // 3 more items

		const flat2 = array.flatDataView();
		expect(Array.from(flat2)).toEqual([1, 2, 0, 0, 0, 0, 0, 0]); // content depends on fill; structure OK
		expect(flat2.buffer).toBe(flat1Buf); // same resizable buffer

		// The previous flat1 view retains its original length/content
		expect(Array.from(flat1)).toEqual([1, 2]);
	});
});

/**
 * --------------- trim ---------------
 */
describe("SegmentedArray: trim (shrink buffer)", () => {
	it("shrinks to fit and preserves data (classic & resizable buffer)", () => {
		for (const be of BUFFER_SETTINGS) {
			const [array] = build({
				constructor: Uint16Array,
				segments: 1,
				itemLength: 2,
				resizableBuffer: be.resizableBuffer,
				initialItemCapacity: be.initialItemCapacity,
				maxItems: be.maxItems,
			});

			array.beginSegment();
			array.pushItem([1, 2]);
			array.pushItem([3, 4]);
			array.endSegment();

			const before = array.bytesAllocated;
			const preView = array.segmentDataView(0);
			const preSnapshot = Array.from(preView);

			array.trim();

			const after = array.bytesAllocated;
			expect(Array.from(array.segmentDataView(0))).toEqual([1, 2, 3, 4]);
			expect(after).toBeLessThanOrEqual(before);
			expect(Array.from(preView)).toEqual(preSnapshot);
		}
	});

	it("throws if called while a segment is open", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		expect(() => {
			array.trim();
		}).toThrow();
	});

	it("resizable buffer: views may become length-0 if high-water mark was reduced before trim()", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 4,
			maxItems: 100,
		});
		array.beginSegment();
		array.pushItem([1, 2]);
		array.endSegment();
		const v = array.segmentDataView(0);

		// reduce high-water mark (clear) then trim -> may shrink to zero
		array.clear();
		array.trim();

		expect(v.length).toBe(0);
	});
});

/**
 * --------------- clear ---------------
 */
describe("SegmentedArray: clear", () => {
	it("resets observable state and keeps capacity", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
		});

		array.beginSegment();
		array.pushItem([1, 2]);
		array.endSegment();

		const before = array.bytesAllocated;
		array.clear();

		expect(array.sizeElements).toBe(0);
		expect(array.sizeItems).toBe(0);
		expect(array.sizeSegments).toBe(0);
		expect(array.bytesAllocated).toBeGreaterThanOrEqual(before - 8); // rough sanity

		expect(() => array.segmentDataView(0)).toThrow(); // data is logically cleared
	});

	it("throws if called while a segment is open", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 1,
		});
		array.beginSegment();
		expect(() => {
			array.clear();
		}).toThrow();
	});
});

/**
 * --------------- Growth semantics (classic vs resizable buffer) ---------------
 */
describe("SegmentedArray: growth semantics", () => {
	it("classic growth: buffer identity changes; old views still readable", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 1, // force growth
		});

		array.beginSegment();
		array.pushItem([1, 2]);
		array.endSegment();

		const oldView = array.segmentDataView(0);
		const oldBuffer = oldView.buffer;

		// trigger growth
		array.beginSegment();
		array.pushItem([3, 4]);
		array.endSegment();

		const newView = array.segmentDataView(1);
		expect(newView.buffer).not.toBe(oldBuffer);
		expect(Array.from(oldView)).toEqual([1, 2]); // still valid
	});

	it("resizable buffer growth: buffer identity preserved; old views valid", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 1,
			maxItems: 10_000,
		});

		array.beginSegment();
		array.pushItem([1, 2]);
		array.endSegment();

		const oldView = array.segmentDataView(0);
		const oldBuffer = oldView.buffer;

		// Trigger resize by writing many elements
		array.beginSegment();
		array.pushItemData(new Uint16Array(9_999 * 2)); // 10k items of length 2
		array.endSegment();

		const newView = array.segmentDataView(1);
		expect(newView.buffer).toBe(oldBuffer);
		expect(Array.from(oldView)).toEqual([1, 2]);
	});

	it("resizable buffer: exceeding maxItems throws RangeError", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
			resizableBuffer: true,
			initialItemCapacity: 1,
			maxItems: 10_000,
		});

		array.beginSegment();
		array.pushItem([1, 2]); // now 1 item present
		expect(() => {
			array.pushItemData(new Uint16Array(10_000 * 2));
		}).toThrow(RangeError);
	});

	it("default growth factor (2x): capacity doubles when exceeding", () => {
		const itemLength = 2; // elements per item
		const initItems = 2; // initial capacity in items
		const initElements = initItems * itemLength; // 4
		const [array, bytesPerElement] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength,
			initialItemCapacity: initItems,
			// growthFactor omitted => default 2
		});

		// Initial capacity in bytes
		expect(bufBytes(array)).toBe(initElements * bytesPerElement);

		// Fill exactly to capacity (no growth)
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]); // total elements: 4
		array.endSegment();
		const capAfterFill = bufBytes(array);
		expect(capAfterFill).toBe(initElements * bytesPerElement);

		// Now exceed capacity by 1 item -> capacity should grow to max(required, 2×current)=8 elements
		array.beginSegment();
		array.pushItem([5, 6]); // total elements now 6 -> target capacity 8 elements
		array.endSegment();
		expect(bufBytes(array)).toBe(8 * bytesPerElement);

		// Exceed 8 → should grow to 16 elements
		array.beginSegment();
		array.pushItem([7, 8]);
		array.pushItem([9, 10]);
		array.pushItem([11, 12]); // total elements: 12 -> next cap: 16
		array.endSegment();
		expect(bufBytes(array)).toBe(16 * bytesPerElement);

		// Data integrity spot-check
		expect(Array.from(array.flatDataView())).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
		]);
	});

	it("custom growthFactor=3: capacity grows to ceil(3x) when exceeded", () => {
		const itemLength = 2;
		const initItems = 2; // 4 elements
		const [array, bytesPerElement] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength,
			initialItemCapacity: initItems,
			growthFactor: 3,
		});

		// Fill to capacity (4 elements)
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.endSegment();
		expect(bufBytes(array)).toBe(4 * bytesPerElement);

		// Exceed by 1 item → grownElements = ceil(4*3)=12; required=6 → target=12
		array.beginSegment();
		array.pushItem([5, 6]); // total elements: 6
		array.endSegment();
		expect(bufBytes(array)).toBe(12 * bytesPerElement);
	});

	it("does not grow when requiredElements <= current capacity (early return)", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength: 2,
			initialItemCapacity: 4, // 8 elements
		});

		const cap0 = bufBytes(array);
		// Write fewer than capacity elements
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.pushItem([5, 6]); // 6 elements written <= 8
		array.endSegment();

		expect(bufBytes(array)).toBe(cap0); // unchanged
	});
});

describe("SegmentedArray: geometric growth (resizable buffer)", () => {
	it("default growth factor (2x): buffer.resize to doubled target (bounded by maxBytes)", () => {
		const itemLength = 2;
		const initItems = 2; // 4 elements initial
		const [array, bytesPerElement] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength,
			initialItemCapacity: initItems,

			resizableBuffer: true,
			maxItems: 1_000, // generous cap
			// default growthFactor=2
		});

		const initCap = bufBytes(array);
		expect(initCap).toBe(4 * bytesPerElement);

		// Fill to capacity (no growth)
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.endSegment();
		expect(bufBytes(array)).toBe(initCap);

		// Exceed → grow to 8 elements
		array.beginSegment();
		array.pushItem([5, 6]);
		array.endSegment();
		expect(bufBytes(array)).toBe(8 * bytesPerElement);

		// Exceed → grow to 16 elements
		array.beginSegment();
		array.pushItem([7, 8]);
		array.pushItem([9, 10]);
		array.pushItem([11, 12]);
		array.endSegment();
		expect(bufBytes(array)).toBe(16 * bytesPerElement);
	});

	it("custom growthFactor=3: buffer grows to ceil(3x) when exceeded", () => {
		const [array, bytesPerElement] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength: 2,
			initialItemCapacity: 2, // 4 elements
			resizableBuffer: true,
			maxItems: 1_000,
			growthFactor: 3,
		});

		// Fill to capacity (4 elements)
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.endSegment();
		expect(bufBytes(array)).toBe(4 * bytesPerElement);

		// Exceed → grownElements = ceil(4*3)=12; required=6 -> target=12
		array.beginSegment();
		array.pushItem([5, 6]);
		array.endSegment();
		expect(bufBytes(array)).toBe(12 * bytesPerElement);
	});

	it("throws RangeError if required bytes exceed resizable cap; state unchanged", () => {
		const itemLength = 2;
		// Cap: maxItems=3 → maxElements=6
		const [array] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength,
			initialItemCapacity: 0,
			resizableBuffer: true,
			maxItems: 3,
		});

		const cap0 = bufBytes(array);
		expect(cap0).toBe(0);

		// Try to append a segment needing 8 elements (> maxElements=6)
		expect(() => {
			array.pushSegment([1, 2, 3, 4, 5, 6, 7, 8]); // 4 items * 2 elements = 8
		}).toThrow();

		// No open segment left behind; nothing was written
		expect(array.sizeSegments).toBe(0);
		expect(array.sizeElements).toBe(0);
		expect(bufBytes(array)).toBe(cap0);
	});

	it("does not grow when requiredElements <= current capacity (early return)", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 10,
			itemLength: 2,
			initialItemCapacity: 4, // 8 elements
			resizableBuffer: true,
			maxItems: 1_000,
		});

		const cap0 = bufBytes(array);
		array.beginSegment();
		array.pushItem([1, 2]);
		array.pushItem([3, 4]);
		array.pushItem([5, 6]); // 6 elements used <= 8 cap
		array.endSegment();
		expect(bufBytes(array)).toBe(cap0);
	});
});

/**
 * --------------- concat (classic buffer result) ---------------
 */
describe("SegmentedArray: concat", () => {
	it("concatenates arrays preserving segment boundaries; no extra capacity allocated", () => {
		// Build A: [ [1,2,3,4], [], [5,6] ] (itemLength=2)
		const [a, bytesPerElement] = build({
			constructor: Uint16Array,
			segments: 3,
			itemLength: 2,
			resizableBuffer: true, // inputs may be anything
			initialItemCapacity: 1, // force some growth internally
			maxItems: 1000,
		});
		a.pushSegment([1, 2, 3, 4]); // 2 items
		a.pushSegment([]); // empty segment
		a.pushSegment([5, 6]); // 1 item

		// Build B: [ [7,8,9,10,11,12], [] ] (3 items, then empty)
		const [b] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 2,
			resizableBuffer: false,
			initialItemCapacity: 8,
		});
		b.pushSegment([7, 8, 9, 10, 11, 12]); // 3 items
		b.pushSegment([]); // empty

		// Concat → classic buffer result with exact capacity
		const out = SegmentedArray.concat([a, b]);

		// Segment structure preserved (2 + 1 + 1 + 3 + 0 = 7 items; 12 elements total)
		expect(out.maxSegments).toBe(5);
		expect(out.sizeSegments).toBe(5);

		expect(out.segmentLength(0)).toBe(2);
		expect(out.segmentLength(1)).toBe(0);
		expect(out.segmentLength(2)).toBe(1);
		expect(out.segmentLength(3)).toBe(3);
		expect(out.segmentLength(4)).toBe(0);

		// Element content in order
		const segmentsAsArrays = Array.from(out.segmentDataViews()).map((v) =>
			Array.from(v)
		);
		expect(segmentsAsArrays).toEqual([
			[1, 2, 3, 4],
			[],
			[5, 6],
			[7, 8, 9, 10, 11, 12],
			[],
		]);

		// Result uses a classic buffer sized exactly to the sum of elements
		const totalElements = 4 + 0 + 2 + 6 + 0; // 12
		expect(bufBytes(out)).toBe(totalElements * bytesPerElement);

		// Output buffer identity is distinct from inputs
		const bufOut = out.flatDataView().buffer;
		expect(bufOut).not.toBe(a.flatDataView().buffer);
		expect(bufOut).not.toBe(b.flatDataView().buffer);
	});

	it("throws if inputs have different TypedArray constructors", () => {
		const [a] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		a.pushSegment([1, 2]);

		const [b] = build({
			constructor: Uint32Array, // different constructor
			segments: 1,
			itemLength: 2,
		});
		b.pushSegment([3, 4]);

		// @ts-expect-error test illegal input
		expect(() => SegmentedArray.concat([a, b])).toThrow();
	});

	it("throws if inputs have different itemLength", () => {
		const [a] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		a.pushSegment([1, 2]);

		const [b] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 3, // mismatched
		});
		b.pushSegment([3, 4, 5]);

		expect(() => SegmentedArray.concat([a, b])).toThrow();
	});

	it("throws if any input has an open segment", () => {
		const [a] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		a.beginSegment();
		a.pushItem([1, 2]); // open, not ended

		const [b] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		b.pushSegment([3, 4]);

		expect(() => SegmentedArray.concat([a, b])).toThrow();
	});

	it("throws on empty input list", () => {
		expect(() => SegmentedArray.concat([])).toThrow();
	});
});

/**
 * --------------- Edge cases ---------------
 */
describe("SegmentedArray: edge cases", () => {
	it("zero segments: cannot begin; reads are out of boundary", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 0,
			itemLength: 3,
		});
		expect(() => {
			array.beginSegment();
		}).toThrow(RangeError);
		expect(() => array.segmentDataView(0)).toThrow(RangeError);
		expect(array.sizeSegments).toBe(0);
	});

	it("empty segment reports length 0", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 1,
			itemLength: 2,
		});
		array.beginSegment();
		// no items
		array.endSegment();
		expect(array.segmentLength(0)).toBe(0);
		expect(Array.from(array.segmentDataView(0))).toEqual([]);
	});
});

/**
 * --------------- Worker Codec (Transfer) ---------------
 */
describe("SegmentedArray: Worker Codec (pack/unpack)", () => {
	it("reconstructs correctly via pack/unpack (simulate transfer)", () => {
		const [array] = build({
			constructor: Uint16Array,
			segments: 2,
			itemLength: 3,
			resizableBuffer: false,
			initialItemCapacity: 8,
		});

		array.beginSegment();
		array.pushItem([1, 2, 3]);
		array.pushItem([4, 5, 6]);
		array.endSegment();

		array.beginSegment();
		array.pushItemData([7, 8, 9, 10, 11, 12]);
		array.endSegment();

		array.trim();

		// 1. Pack
		const { payload, transfer } = array.pack();

		// Verify transferables
		expect(transfer).toContain(payload.data.buffer);
		expect(transfer).toContain(payload.offsets.buffer);

		// 2. Unpack
		const clone = SegmentedArray.unpack<Uint16Array>(payload);

		expect(clone.maxSegments).toBe(2);
		expect(clone.itemLength).toBe(3);
		expect(clone.sizeSegments).toBe(2);
		expect(clone.sizeElements).toBe(12);
		expect(Array.from(clone.segmentDataView(0))).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
		expect(Array.from(clone.segmentDataView(1))).toEqual([
			7, 8, 9, 10, 11, 12,
		]);

		expect(clone.getItem(1, 1)).toEqual([10, 11, 12]);
	});
});

/**
 * --------------- Readonly ---------------
 */
describe("SegmentedArray: Readonly behavior", () => {
	it("toReadonly should disable mutations but allow dehydrate/pack", () => {
		const arr = SegmentedArray.create(Uint8Array, 1, 5);
		arr.beginSegment();
		arr.pushItem([1]);
		arr.endSegment();

		SegmentedArray.toReadonly(arr);

		// Mutations should fail
		expect(() => {
			arr.beginSegment();
		}).toThrow("read-only");
		expect(() => {
			arr.trim();
		}).toThrow("read-only");
		expect(() => {
			arr.clear();
		}).toThrow("read-only");

		// Serialization should SUCCEED
		expect(() => arr.dehydrate()).not.toThrow();
		expect(() => arr.pack()).not.toThrow();
	});
});
