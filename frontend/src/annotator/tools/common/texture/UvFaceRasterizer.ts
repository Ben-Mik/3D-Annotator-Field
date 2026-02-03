import { Vector2, type BufferAttribute } from "three";
import { SegmentedArray } from "~util/datastructures/SegmentedArray";
import { assertUnreachable } from "~util/TypeScript";

/**
 * Initial capacity (in **scalars**, not pairs) for the per-face output buffer.
 * This is the internal buffer reused for writing `[x,y,x,y,...]` pixel coordinates
 * before each segment is pushed into the SegmentedArray. It grows by doubling when needed.
 */
const INITIAL_OUT_CAPACITY = 16_384;

/**
 * Lower bound for the SegmentedArray's `initialItemCapacity` (measured in **items**,
 * where one item is a single (x,y) pair).
 */
const MIN_SEGMENTED_ARRAY_SIZE = 1024;

/**
 * Fraction of the total canvas pixel count used to estimate how many items
 * (x,y pairs) a given face range will produce: `approx = W * H * (range/totalFaces) * factor`.
 * A value in `[0,1]` keeps the first allocation conservative; resizing is allowed.
 */
const PIXEL_COUNT_APPROXIMATION_FACTOR = 0.5;

/**
 * Upper bound (as a multiple of total canvas pixels) for the SegmentedArray's
 * `maxItems`. Shouldn't be reached by any texture in practice.
 */
const PIXEL_COUNT_UPPER_BOUND_FACTOR = 2.5;

/** Reusable empty segment for degenerate/invalid faces (0 items). */
const EMPTY = new Uint16Array(0);

/** Reusable no-op function. */
// eslint-disable-next-line @typescript-eslint/no-empty-function
const NO_OP = () => {};

/** Growth factor of the internal output buffer. */
const GROWTH_FACTOR = 1.25;

/**
 * High-performance UV-triangle to pixel coverage rasterizer.
 *
 * A pixel is included if **any** of the following holds in UV space:
 *  1) **Any corner** of the pixel’s unit square lies inside or on the triangle
 *  2) **Any triangle vertex** lies inside or on the pixel’s unit square
 *  3) **Any triangle edge** intersects **any** edge of the pixel’s unit square
 *     (inclusive of endpoints and colinear overlap)
 *
 * Design goals:
 *  - No per-face allocations (reuses an output buffer)
 *  - Early-outs for degenerate faces and bounding-box rejects
 *  - Chunk-friendly: construct once per worker and call `computeRange` for each chunk
 *
 * Coordinate conventions:
 *  - `x = round(u * W)`, `y = round((1 - v) * H)` (vertical flip preserved)
 *  - Canvas scan bounds use an expanded integer bounding box (+/-1)
 *  - All boundary tests are **inclusive** (edges count as inside/intersecting).
 */
export class UvFaceRasterizer {
	private readonly _uvArray: Float32Array;
	private readonly _totalFaceCount: number;

	private readonly _canvasWidth: number;
	private readonly _canvasHeight: number;
	private readonly _inverseCanvasWidth: number;
	private readonly _inverseCanvasHeight: number;
	private readonly _totalPixelCount: number;

	/** Target output buffer [x,y,x,y,...] */
	private _out?: Uint16Array;
	/** Current write cursor into `_out` (scalar index) */
	private _writePosition = 0;

	/**
	 * Constructs a rasterizer bound to a uv attribute and a canvas size.
	 *
	 * @param uvAttribute - Three.js uv buffer attribute (Float32Array, itemSize = 2).
	 * @param canvasWidth - Canvas width in pixels.
	 * @param canvasHeight - Canvas height in pixels.
	 *
	 * @throws {Error} If `uvAttribute` is not Float32 itemSize=2.
	 */
	constructor(
		uvAttribute: BufferAttribute,
		canvasWidth: number,
		canvasHeight: number
	) {
		if (
			uvAttribute.itemSize !== 2 ||
			!(uvAttribute.array instanceof Float32Array)
		) {
			throw new Error(
				"UvFaceRasterizer: uv Attribute with itemSize=2 and Float32Array is required."
			);
		}

		this._uvArray = uvAttribute.array as Float32Array;
		this._totalFaceCount = Math.floor(uvAttribute.count / 3);

		this._canvasWidth = canvasWidth;
		this._canvasHeight = canvasHeight;
		this._inverseCanvasWidth = 1 / canvasWidth;
		this._inverseCanvasHeight = 1 / canvasHeight;
		this._totalPixelCount = canvasWidth * canvasHeight;
	}

	/** Canvas width in pixels (read-only). */
	public get canvasWidth() {
		return this._canvasWidth;
	}

	/** Canvas height in pixels (read-only). */
	public get canvasHeight() {
		return this._canvasHeight;
	}

	/**
	 * Computes pixel coverage for faces in `[faceStart, faceEnd)`, returning a
	 * `SegmentedArray<Uint16Array>` where each segment contains `[x,y]` pairs
	 * for a single face in the same order as the input face indices.
	 *
	 * Memory behavior:
	 *  - The returned `SegmentedArray` is newly allocated for the range, with capacity
	 *    estimated from the range size and canvas area; it can grow if needed.
	 *  - Per-face coverage is written into an internal buffer => no allocations per face/pixel
	 *
	 * Performance notes:
	 *  - Degenerate/invalid UV triangles early-out with an empty segment
	 *  - Fast rejects using both canvas and UV-space bounding boxes
	 *  - Pure arithmetic (no per-pixel allocations)
	 *
	 * @param faceStart - Inclusive start face index.
	 * @param faceEnd - Exclusive end face index.
	 * @returns A new `SegmentedArray` containing the pixel data for the range.
	 */
	public computeRange(
		faceStart: number,
		faceEnd: number
	): SegmentedArray<Uint16Array> {
		const canvasPositionsPerFace = this._createSegmentedArray(
			faceStart,
			faceEnd
		);

		this._processRange(
			faceStart,
			faceEnd,
			"segmentedArray",
			canvasPositionsPerFace
		);

		return canvasPositionsPerFace;
	}

	/**
	 * Computes only the number of pixels for each face in the range [faceStart, faceEnd).
	 *
	 * @param faceStart - Inclusive start face index.
	 * @param faceEnd - Exclusive end face index.
	 * @returns A Uint32Array where index `i` holds the pixel *pair count*
	 * (item count) for `faceStart + i`.
	 */
	public computeRangeCounts(faceStart: number, faceEnd: number): Uint32Array {
		const numberOfFaces = faceEnd - faceStart;
		const counts = new Uint32Array(numberOfFaces);

		this._processRange(faceStart, faceEnd, "count", counts);

		return counts;
	}

	/**
	 * Rasterizes faces and writes [x,y] pairs directly into a pre-allocated buffer,
	 * starting at a specific offset.
	 *
	 * @warning Callers are responsible to ensure that `buffer` can fit all pixels, e.g.
	 * by running {@link computeRangeCounts} beforehand.
	 *
	 * @param faceStart - Inclusive start face index.
	 * @param faceEnd - Exclusive end face index.
	 * @param outputBuffer - The Uint16Array to write the pixel data into.
	 * @param offset - The *element* (scalar) index in `buffer` where this
	 * chunk's data should begin.
	 */
	public computeRangeInto(
		faceStart: number,
		faceEnd: number,
		outputBuffer: Uint16Array,
		offset: number
	): void {
		this._processRange(faceStart, faceEnd, "buffer", outputBuffer, offset);
	}

	/**
	 * Internal unified processor for all `computeRange...` methods.
	 * This method contains the single, optimized loop over faces,
	 * dispatching to the correct rasterizer mode for each.
	 */
	private _processRange(
		faceStart: number,
		faceEnd: number,
		mode: "count",
		counts: Uint32Array
	): void;
	private _processRange(
		faceStart: number,
		faceEnd: number,
		mode: "segmentedArray",
		segmentedArray: SegmentedArray<Uint16Array>
	): void;
	private _processRange(
		faceStart: number,
		faceEnd: number,
		mode: "buffer",
		outputBuffer: Uint16Array,
		offset: number
	): void;
	private _processRange(
		faceStart: number,
		faceEnd: number,
		mode: "count" | "buffer" | "segmentedArray",
		target: Uint32Array | SegmentedArray<Uint16Array> | Uint16Array,
		offset = 0
	) {
		let onPixel: (x: number, y: number) => void;

		let counts: Uint32Array;
		let outputBuffer: Uint16Array | undefined;
		let segmentedArray: SegmentedArray<Uint16Array> | undefined;

		switch (mode) {
			case "count":
				counts = target as Uint32Array;
				onPixel = NO_OP;
				break;
			case "buffer":
				outputBuffer = target as Uint16Array;
				this._out = outputBuffer;
				this._writePosition = offset;
				onPixel = this._push;
				break;
			case "segmentedArray":
				segmentedArray = target as SegmentedArray<Uint16Array>;
				if (this._out === undefined) {
					this._out = new Uint16Array(INITIAL_OUT_CAPACITY);
				}
				onPixel = this._pushGrow;
				break;
			default:
				assertUnreachable(mode);
		}

		const faceCount = faceEnd - faceStart;
		// 3 vertices per face, 2 scalars (u,v) per vertex
		const faceWindow = 2 * 3;
		for (
			let i = 0, base = faceStart * faceWindow;
			i < faceCount;
			i++, base += faceWindow
		) {
			const Au = this._uvArray[base];
			const Av = this._uvArray[base + 1];
			const Bu = this._uvArray[base + 2];
			const Bv = this._uvArray[base + 3];
			const Cu = this._uvArray[base + 4];
			const Cv = this._uvArray[base + 5];

			// Early-out: invalid or perfectly collinear triangle in UV space
			const area2uv = (Bu - Au) * (Cv - Av) - (Bv - Av) * (Cu - Au);
			if (!Number.isFinite(area2uv) || area2uv === 0) {
				if (mode === "count") {
					counts![i] = 0;
				} else if (mode === "segmentedArray") {
					segmentedArray!.pushSegment(EMPTY);
				}
				// 'into' mode does nothing for degenerate faces
				continue;
			}

			switch (mode) {
				case "count":
					counts![i] = this._rasterizeFace(
						Au,
						Av,
						Bu,
						Bv,
						Cu,
						Cv,
						onPixel
					);
					break;
				case "buffer":
					this._rasterizeFace(Au, Av, Bu, Bv, Cu, Cv, onPixel);
					break;
				case "segmentedArray":
					this._writePosition = 0;
					this._rasterizeFace(Au, Av, Bu, Bv, Cu, Cv, onPixel);
					segmentedArray!.pushSegment(
						this._out!.subarray(0, this._writePosition)
					);
					break;
				default:
					assertUnreachable(mode);
			}
		}

		if (mode === "buffer") {
			this._out = undefined;
		}
	}

	/**
	 * Constructs a `SegmentedArray<Uint16Array>` sized for `[faceStart, faceEnd)` using a
	 * conservative capacity estimate based on the face range’s share of the canvas area.
	 * The array can grow up to `PIXEL_COUNT_UPPER_BOUND_FACTOR * (W*H)` items if needed.
	 *
	 * @param faceStart - Inclusive start face index.
	 * @param faceEnd - Exclusive end face index.
	 * @returns A new `SegmentedArray` configured for the range.
	 */
	private _createSegmentedArray(faceStart: number, faceEnd: number) {
		const numberOfFaces = faceEnd - faceStart;
		const approximateShareOfPixels = Math.floor(
			this._totalPixelCount *
				(numberOfFaces / this._totalFaceCount) *
				PIXEL_COUNT_APPROXIMATION_FACTOR
		);
		const initialItemCapacity = Math.max(
			approximateShareOfPixels,
			MIN_SEGMENTED_ARRAY_SIZE
		);
		const maxItems = this._totalPixelCount * PIXEL_COUNT_UPPER_BOUND_FACTOR;

		return SegmentedArray.create(Uint16Array, 2, numberOfFaces, {
			initialItemCapacity,
			resizable: { maxItems },
		});
	}

	/**
	 * Core rasterizer engine. Scans the bbox for a single face and performs
	 * the action specified by `onPixel` for every pixel that passes inclusion tests.
	 *
	 * Implementation details:
	 *  - Builds an expanded integer canvas bounding box (±1 pixel) around the projected
	 *    triangle and clamps it to `[0..W]×[0..H]` (inclusive loops)
	 *  - Uses a UV-space triangle bounding box for early row/column rejects
	 *  - Per pixel, evaluates:
	 *      A) any pixel-corner inside triangle (inclusive),
	 *      B) any triangle vertex inside pixel rect (inclusive),
	 *      C) any triangle edge intersects any rect edge (inclusive, with colinear checks)
	 *
	 * @param Au - U coordinate of vertex A.
	 * @param Av - V coordinate of vertex A.
	 * @param Bu - U coordinate of vertex B.
	 * @param Bv - V coordinate of vertex B.
	 * @param Cu - U coordinate of vertex C.
	 * @param Cv - V coordinate of vertex C.
	 * @param onPixel - Callback `(x, y)` invoked for each included pixel.
	 * @returns The total number of pixels, i.e. (x,y) pairs found (the item count).
	 */
	private _rasterizeFace(
		Au: number,
		Av: number,
		Bu: number,
		Bv: number,
		Cu: number,
		Cv: number,
		onPixel: (x: number, y: number) => void
	): number {
		let pixelCount = 0;

		const w = this._canvasWidth;
		const h = this._canvasHeight;
		const invW = this._inverseCanvasWidth;
		const invH = this._inverseCanvasHeight;

		// UV to canvas (rounded), preserving vertical flip (1 - v)
		const x0 = Math.round(Au * w);
		const y0 = Math.round((1 - Av) * h);
		const x1 = Math.round(Bu * w);
		const y1 = Math.round((1 - Bv) * h);
		const x2 = Math.round(Cu * w);
		const y2 = Math.round((1 - Cv) * h);

		// Canvas bounding box with +/-1 padding
		let minX = Math.min(x0, x1, x2) - 1;
		let maxX = Math.max(x0, x1, x2) + 1;
		let minY = Math.min(y0, y1, y2) - 1;
		let maxY = Math.max(y0, y1, y2) + 1;

		// Clamp to canvas bounds; loops are inclusive on both ends
		minX = Math.max(0, minX);
		minY = Math.max(0, minY);
		maxX = Math.min(w, maxX);
		maxY = Math.min(h, maxY);

		if (maxX < minX || maxY < minY) return 0;

		// UV-space triangle bbox
		const minU = Math.min(Au, Bu, Cu);
		const maxU = Math.max(Au, Bu, Cu);
		const minV = Math.min(Av, Bv, Cv);
		const maxV = Math.max(Av, Bv, Cv);

		/** Signed double area (orientation) of triangle ABC in UV space. */
		const orientation = (
			ax: number,
			ay: number,
			bx: number,
			by: number,
			cx: number,
			cy: number
		) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

		/** Edge-inclusive point-in-triangle test in UV space. */
		const isPointInFace = (u: number, v: number) => {
			const o1 = orientation(Au, Av, Bu, Bv, u, v);
			const o2 = orientation(Bu, Bv, Cu, Cv, u, v);
			const o3 = orientation(Cu, Cv, Au, Av, u, v);
			const hasNegative = o1 < 0 || o2 < 0 || o3 < 0;
			const hasPositive = o1 > 0 || o2 > 0 || o3 > 0;
			return !(hasNegative && hasPositive);
		};

		/** Inclusive axis aligned bounding box containment for a UV-space rectangle. */
		const doesRectangleContainPoint = (
			u0: number,
			v0: number,
			u1: number,
			v1: number,
			u: number,
			v: number
		) => u >= u0 && u <= u1 && v >= v0 && v <= v1;

		/** On-segment test for colinear points (inclusive at endpoints). */
		const isOnSegment = (
			ax: number,
			ay: number,
			bx: number,
			by: number,
			px: number,
			py: number
		) =>
			Math.min(ax, bx) <= px &&
			px <= Math.max(ax, bx) &&
			Math.min(ay, by) <= py &&
			py <= Math.max(ay, by);

		/**
		 * Segment–segment intersection (inclusive), using orientation tests
		 * + colinearity handling via `isOnSegment`.
		 */
		const doSegmentsIntersect = (
			ax: number,
			ay: number,
			bx: number,
			by: number,
			cx: number,
			cy: number,
			dx: number,
			dy: number
		) => {
			const o1 = orientation(ax, ay, bx, by, cx, cy);
			const o2 = orientation(ax, ay, bx, by, dx, dy);
			const o3 = orientation(cx, cy, dx, dy, ax, ay);
			const o4 = orientation(cx, cy, dx, dy, bx, by);

			// General straddling case (proper intersection)
			if (o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0) return true;

			// Colinear inclusive cases (touching/overlap count as intersecting)
			if (o1 === 0 && isOnSegment(ax, ay, bx, by, cx, cy)) return true;
			if (o2 === 0 && isOnSegment(ax, ay, bx, by, dx, dy)) return true;
			if (o3 === 0 && isOnSegment(cx, cy, dx, dy, ax, ay)) return true;
			if (o4 === 0 && isOnSegment(cx, cy, dx, dy, bx, by)) return true;

			return false;
		};

		// Scan the canvas bounding box row-by-row, column-by-column.
		for (let y = minY; y <= maxY; y++) {
			const vTop = 1 - y * invH;
			const vBottom = 1 - (y + 1) * invH;

			// Row outside triangle UV bounding box
			if (vBottom > maxV || vTop < minV) continue;

			let uLeft = minX * invW;
			let uRight = uLeft + invW;

			for (let x = minX; x <= maxX; x++, uLeft += invW, uRight += invW) {
				// Column outside triangle UV bounding box
				if (uRight < minU || uLeft > maxU) continue;

				const uL = uLeft;
				const uR = uRight;
				const vT = vTop;
				const vB = vBottom;

				// Any pixel corner inside triangle?
				if (
					isPointInFace(uL, vT) ||
					isPointInFace(uR, vT) ||
					isPointInFace(uR, vB) ||
					isPointInFace(uL, vB)
				) {
					onPixel(x, y);
					pixelCount++;
					continue;
				}

				// Any triangle vertex inside pixel rect?
				if (
					doesRectangleContainPoint(uL, vB, uR, vT, Au, Av) ||
					doesRectangleContainPoint(uL, vB, uR, vT, Bu, Bv) ||
					doesRectangleContainPoint(uL, vB, uR, vT, Cu, Cv)
				) {
					onPixel(x, y);
					pixelCount++;
					continue;
				}

				// Any edge intersection? (3 triangle edges × 4 rect edges)
				const hit =
					doSegmentsIntersect(Au, Av, Bu, Bv, uL, vT, uR, vT) || // top
					doSegmentsIntersect(Au, Av, Bu, Bv, uR, vT, uR, vB) || // right
					doSegmentsIntersect(Au, Av, Bu, Bv, uR, vB, uL, vB) || // bottom
					doSegmentsIntersect(Au, Av, Bu, Bv, uL, vB, uL, vT) || // left
					doSegmentsIntersect(Bu, Bv, Cu, Cv, uL, vT, uR, vT) ||
					doSegmentsIntersect(Bu, Bv, Cu, Cv, uR, vT, uR, vB) ||
					doSegmentsIntersect(Bu, Bv, Cu, Cv, uR, vB, uL, vB) ||
					doSegmentsIntersect(Bu, Bv, Cu, Cv, uL, vB, uL, vT) ||
					doSegmentsIntersect(Cu, Cv, Au, Av, uL, vT, uR, vT) ||
					doSegmentsIntersect(Cu, Cv, Au, Av, uR, vT, uR, vB) ||
					doSegmentsIntersect(Cu, Cv, Au, Av, uR, vB, uL, vB) ||
					doSegmentsIntersect(Cu, Cv, Au, Av, uL, vB, uL, vT);

				if (hit) {
					onPixel(x, y);
					pixelCount++;
				}
			}
		}

		return pixelCount;
	}

	/**
	 * Writes a pixel `(x,y)` into `this._out` at `this._writePosition`
	 * and moves the write position with each scalar.
	 *
	 * Defined as an arrow function to auto-bind `this`.
	 */
	private _push = (x: number, y: number): void => {
		this._out![this._writePosition++] = x;
		this._out![this._writePosition++] = y;
	};

	/**
	 * Writes a pixel `(x,y)` into `this._out` at `this._writePosition`
	 * and moves the write position with each scalar. Grows the buffer
	 * if necessary and caps the growth to `2*W*H` elements to avoid
	 * exceeding the maximum possible output.
	 *
	 * Defined as an arrow function to auto-bind `this`.
	 *
	 * @param x - Canvas x coordinate (integer).
	 * @param y - Canvas y coordinate (integer).
	 */
	private _pushGrow = (x: number, y: number): void => {
		const out = this._out!;
		if (this._writePosition + 2 > out.length) {
			const next = new Uint16Array(
				Math.min(out.length * GROWTH_FACTOR, 2 * this._totalPixelCount)
			);
			next.set(this._out!);
			this._out = next;
		}
		out[this._writePosition++] = x;
		out[this._writePosition++] = y;
	};

	/**
	 * Convert UV coordinates to canvas pixel coordinates using the rasterizer's convention.
	 *
	 * Mapping:
	 * x = round(u * canvasWidth)
	 * y = round((1 - v) * canvasHeight) 	// vertical flip preserved
	 *
	 * @param uv - Vector2 of (u, v).
	 * @param canvasWidth - Canvas width.
	 * @param canvasHeight - Canvas height.
	 * @param target - Optional `Vector2` to reuse and avoid allocations.
	 * @returns The resulting `Vector2` (either `target` or a new instance).
	 */
	public static uvToCanvasPosition(
		uv: Vector2,
		canvasWidth: number,
		canvasHeight: number,
		target?: Vector2
	): Vector2;

	/**
	 * Convert UV coordinates to canvas pixel coordinates using the rasterizer's convention.
	 *
	 * Mapping:
	 * x = round(u * canvasWidth)
	 * y = round((1 - v) * canvasHeight) 	// vertical flip preserved
	 *
	 * @param u - U coordinate.
	 * @param v - V coordinate.
	 * @param canvasWidth - Canvas width.
	 * @param canvasHeight - Canvas height.
	 * @param target - Optional `Vector2` to reuse and avoid allocations.
	 * @returns The resulting `Vector2` (either `target` or a new instance).
	 */
	public static uvToCanvasPosition(
		u: number,
		v: number,
		canvasWidth: number,
		canvasHeight: number,
		target?: Vector2
	): Vector2;
	public static uvToCanvasPosition(
		uOrVector: number | Vector2,
		vOrW: number,
		wOrH: number,
		hOrTarget?: number | Vector2,
		maybeTarget?: Vector2
	): Vector2 {
		let u: number;
		let v: number;
		let w: number;
		let h: number;
		let out: Vector2 | undefined;

		if (typeof uOrVector === "number") {
			// Signature: (u, v, W, H, [target])
			u = uOrVector;
			v = vOrW;
			w = wOrH;
			h = hOrTarget as number;
			out = maybeTarget;
		} else {
			// Signature: (uv, W, H, [target])
			u = uOrVector.x;
			v = uOrVector.y;
			w = vOrW;
			h = wOrH;
			out = (hOrTarget as Vector2) || undefined;
		}

		const x = Math.round(u * w);
		const y = Math.round((1 - v) * h);

		if (out) {
			out.set(x, y);
			return out;
		}
		return new Vector2(x, y);
	}
}
