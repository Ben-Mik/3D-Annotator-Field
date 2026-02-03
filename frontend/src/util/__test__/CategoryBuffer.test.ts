import { CategoryBuffer } from "~util/datastructures/CategoryBuffer";

describe("CategoryBuffer", () => {
	describe("Construction and Initialization", () => {
		it("should initialize with correct capacity and sizes", () => {
			const buffer = CategoryBuffer.create(Uint16Array, 100);
			expect(buffer.maxElements).toBe(100);
			expect(buffer.capacity).toBe(100);
			expect(buffer.sizeA).toBe(0);
			expect(buffer.sizeB).toBe(0);
			expect(buffer.sizeTotal).toBe(0);
			expect(buffer.remainingCapacity).toBe(100);
			expect(buffer.bytesAllocated).toBe(
				100 * Uint16Array.BYTES_PER_ELEMENT
			);
		});

		it("should throw RangeError for invalid maxElements", () => {
			expect(() => CategoryBuffer.create(Uint16Array, -1)).toThrow(
				RangeError
			);
			expect(() => CategoryBuffer.create(Uint16Array, 1.5)).toThrow(
				RangeError
			);
			expect(() => CategoryBuffer.create(Float32Array, NaN)).toThrow(
				RangeError
			);
		});

		it("should handle zero capacity", () => {
			const buffer = CategoryBuffer.create(Uint32Array, 0);
			expect(buffer.maxElements).toBe(0);
			expect(buffer.remainingCapacity).toBe(0);
			expect(buffer.bytesAllocated).toBe(0);
		});
	});

	describe("pushA() and pushB()", () => {
		let buffer: CategoryBuffer<Float32Array>;
		beforeEach(() => {
			buffer = CategoryBuffer.create(Float32Array, 10);
		});

		it("should add elements to category A in insertion order", () => {
			buffer.pushA(10.5);
			buffer.pushA(20.0);
			expect(buffer.sizeA).toBe(2);
			expect(buffer.sizeTotal).toBe(2);
			expect(buffer.remainingCapacity).toBe(8);

			const viewA = buffer.getCategoryAView();
			expect(viewA.length).toBe(2);
			expect(viewA[0]).toBe(10.5);
			expect(viewA[1]).toBe(20.0);
			expect(viewA).toEqual(new Float32Array([10.5, 20.0]));
		});

		it("should add elements to category B in reverse insertion order", () => {
			buffer.pushB(100);
			buffer.pushB(200);
			expect(buffer.sizeB).toBe(2);
			expect(buffer.sizeTotal).toBe(2);
			expect(buffer.remainingCapacity).toBe(8);

			const viewB = buffer.getCategoryBView();
			expect(viewB.length).toBe(2);
			// Note: 200 was last push, so it's first in the view
			expect(viewB[0]).toBe(200);
			expect(viewB[1]).toBe(100);
			expect(viewB).toEqual(new Float32Array([200, 100]));
		});

		it("should fill buffer from both ends", () => {
			buffer.pushA(1);
			buffer.pushB(10);
			buffer.pushA(2);
			buffer.pushB(20);
			buffer.pushA(3);

			expect(buffer.sizeA).toBe(3);
			expect(buffer.sizeB).toBe(2);
			expect(buffer.sizeTotal).toBe(5);
			expect(buffer.remainingCapacity).toBe(5);

			expect(buffer.getCategoryAView()).toEqual(
				new Float32Array([1, 2, 3])
			);
			expect(buffer.getCategoryBView()).toEqual(
				new Float32Array([20, 10])
			);
		});
	});

	describe("Capacity and Edge Cases", () => {
		it("should throw RangeError when buffer is full (pushA)", () => {
			const buffer = CategoryBuffer.create(Uint8Array, 2);
			buffer.pushA(1);
			buffer.pushB(2);
			expect(buffer.remainingCapacity).toBe(0);
			expect(() => {
				buffer.pushA(3);
			}).toThrow(RangeError);
		});

		it("should throw RangeError when buffer is full (pushB)", () => {
			const buffer = CategoryBuffer.create(Uint8Array, 2);
			buffer.pushA(1);
			buffer.pushB(2);
			expect(buffer.remainingCapacity).toBe(0);
			expect(() => {
				buffer.pushB(3);
			}).toThrow(RangeError);
		});

		it("should handle buffer of size 1", () => {
			const buffer = CategoryBuffer.create(Uint8Array, 1);
			buffer.pushA(1);
			expect(buffer.remainingCapacity).toBe(0);
			expect(() => {
				buffer.pushB(2);
			}).toThrow(RangeError);

			buffer.clear();
			buffer.pushB(2);
			expect(buffer.remainingCapacity).toBe(0);
			expect(() => {
				buffer.pushA(1);
			}).toThrow(RangeError);
		});

		it("should throw on buffer of size 0", () => {
			const buffer = CategoryBuffer.create(Uint8Array, 0);
			expect(() => {
				buffer.pushA(1);
			}).toThrow(RangeError);
			expect(() => {
				buffer.pushB(1);
			}).toThrow(RangeError);
		});
	});

	describe("clear()", () => {
		let buffer: CategoryBuffer<Int16Array>;
		beforeEach(() => {
			buffer = CategoryBuffer.create(Int16Array, 10);
			buffer.pushA(10);
			buffer.pushB(20);
		});

		it("should reset sizes to zero", () => {
			expect(buffer.sizeA).toBe(1);
			expect(buffer.sizeB).toBe(1);
			expect(buffer.sizeTotal).toBe(2);

			buffer.clear();

			expect(buffer.sizeA).toBe(0);
			expect(buffer.sizeB).toBe(0);
			expect(buffer.sizeTotal).toBe(0);
			expect(buffer.remainingCapacity).toBe(10);
		});

		it("should result in empty views after clear", () => {
			buffer.clear();
			expect(buffer.getCategoryAView().length).toBe(0);
			expect(buffer.getCategoryBView().length).toBe(0);
		});

		it("should allow reusing buffer after clear", () => {
			buffer.clear();
			buffer.pushA(100);
			buffer.pushB(200);
			buffer.pushB(300);

			expect(buffer.sizeA).toBe(1);
			expect(buffer.sizeB).toBe(2);
			expect(buffer.getCategoryAView()).toEqual(new Int16Array([100]));
			expect(buffer.getCategoryBView()).toEqual(
				new Int16Array([300, 200])
			);
		});
	});

	describe("Transfer (pack / unpack)", () => {
		let buffer: CategoryBuffer<Float32Array>;
		// We infer the DTO type automatically if it's not exported
		let payload: ReturnType<CategoryBuffer<Float32Array>["dehydrate"]>;
		let transferList: Transferable[];

		beforeEach(() => {
			// 1. Use .create() instead of new CategoryBuffer()
			buffer = CategoryBuffer.create(Float32Array, 10);
			buffer.pushA(1.5);
			buffer.pushA(2.5);
			buffer.pushB(100);
			buffer.pushB(200);

			// 2. Use .pack() instead of .toTransfer()
			const transferData = buffer.pack();
			payload = transferData.payload;
			transferList = transferData.transfer;
		});

		it("should serialize and deserialize (transfer) correctly", () => {
			// Check payload contents
			// Note: 'kind', 'version', and 'arrayName' are no longer part of the DTO
			expect(payload.maxElements).toBe(10);
			expect(payload.sizeA).toBe(2);
			expect(payload.sizeB).toBe(2);

			// The DTO now holds the TypedArray directly
			expect(payload.data).toBeInstanceOf(Float32Array);

			// 3. Check that the underlying buffer is in the transfer list
			expect(transferList).toEqual([payload.data.buffer]);

			// 4. Use .unpack() (or .hydrate()) instead of .fromTransfer()
			const newBuffer = CategoryBuffer.unpack<Float32Array>(payload);

			// Check re-hydrated state
			expect(newBuffer).toBeInstanceOf(CategoryBuffer);
			expect(newBuffer.maxElements).toBe(10);
			expect(newBuffer.sizeA).toBe(2);
			expect(newBuffer.sizeB).toBe(2);
			expect(newBuffer.sizeTotal).toBe(4);
			expect(newBuffer.remainingCapacity).toBe(6);

			// Check re-hydrated data
			expect(newBuffer.getCategoryAView()).toEqual(
				new Float32Array([1.5, 2.5])
			);
			expect(newBuffer.getCategoryBView()).toEqual(
				new Float32Array([200, 100])
			);
		});

		it("should transfer an empty buffer", () => {
			const emptyBuffer = CategoryBuffer.create(Uint32Array, 5);
			const { payload: emptyPayload } = emptyBuffer.pack();

			const newEmptyBuffer =
				CategoryBuffer.unpack<Uint32Array>(emptyPayload);

			expect(newEmptyBuffer.sizeA).toBe(0);
			expect(newEmptyBuffer.sizeB).toBe(0);
			expect(newEmptyBuffer.maxElements).toBe(5);
		});

		it("should transfer a full buffer", () => {
			const fullBuffer = CategoryBuffer.create(Int8Array, 4);
			fullBuffer.pushA(1);
			fullBuffer.pushA(2);
			fullBuffer.pushB(3);
			fullBuffer.pushB(4);

			const { payload } = fullBuffer.pack();
			const newFullBuffer = CategoryBuffer.unpack<Int8Array>(payload);

			expect(newFullBuffer.sizeTotal).toBe(4);
			expect(newFullBuffer.remainingCapacity).toBe(0);
			expect(newFullBuffer.getCategoryAView()).toEqual(
				new Int8Array([1, 2])
			);
			expect(newFullBuffer.getCategoryBView()).toEqual(
				new Int8Array([4, 3])
			);
		});
	});
});
