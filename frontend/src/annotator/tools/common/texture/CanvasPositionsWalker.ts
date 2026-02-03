import {
	Vector3,
	type BufferAttribute,
	type Mesh as ThreeMesh,
	type Vector2,
} from "three";
import type { CanvasPositionsPerFace } from "~annotator/scene/model/TextureMesh";

type Predicate = (
	position: Vector3,
	x: number,
	y: number,
	faceIndex: number
) => boolean;

/**
 * Hot-path walker over precomputed **per-face canvas positions**. For the given
 * face sets it emits a deduplicated list of canvas pixels (as **linear indices**),
 * optionally testing each pixel with a user predicate.
 *
 * ### Key properties
 * - **Output layout:** a `Uint32Array` of linear indices (`x + y * width`).
 * - **Space of `position`:** **mesh local space** (not world). This class assumes
 *   the mesh’s world transform is effectively identity for the brush logic. If you
 *   move/scale/rotate the mesh (or parents), adapt predicates to local space.
 * - **Indexing model:** The walker operates in **non-indexed face space**:
 *   it computes `base = faceIndex * 3` and reads three consecutive vertices/UVs.
 *   The `geometry.index` (if present, e.g. for BVH) is **ignored**. Callers must
 *   supply **non-indexed face indices** (already de-indexed) that match the layout
 *   of `position`/`uv` attributes used by the walker.
 * - **Dedupe:** Each pixel is emitted at most once per session.
 * - **Preallocation:** the output buffer is sized to `totalMappedUniquePixels`
 *   (the union across all faces) and never resized in the hot path.
 *
 * ### Typical use
 * 1) Build `CanvasPositionsPerFace` in your rasterizer and compute
 *    `totalMappedUniquePixels` once.
 * 2) Provide **non-indexed face indices** to {@link collect}.
 * 3) Call {@link startDedupeSession} for each logical paint/selection pass.
 * 4) Call {@link collect} with face lists and your predicate(s).
 *
 * @remarks
 * - The returned array is a **view** (`subarray`) into the internal buffer; copy it
 *   if you need to retain it after the next call to `collect`.
 */
export class CanvasPositionsWalker {
	private readonly _width: number;
	private readonly _widthInverse: number;
	private readonly _height: number;
	private readonly _heightInverse: number;

	/** Packed XYZ positions from `geometry.position` (Float32, itemSize=3, non-indexed). */
	private readonly _positions: Float32Array;
	/** Packed UVs from `geometry.uv` (Float32, itemSize=2). */
	private readonly _uv: Float32Array;
	/** Precomputed per-face flattened `(x,y)` pairs (Uint16). */
	private readonly _canvasPositionsPerFace: CanvasPositionsPerFace;
	/** Reused 3D position passed into the predicate (mesh **local** space). */
	private readonly _currentPosition = new Vector3();

	/**
	 * Output buffer of linear indices. Preallocated to `totalMappedUniquePixels`
	 * and never resized.
	 */
	private _out: Uint32Array;
	/** Scalar write cursor into `_out`. */
	private _outWritePosition: number;

	/**
	 * Per-pixel dedupe session map (one byte per canvas pixel). Values are compared
	 * against `_dedupeSession` to test/set whether a pixel was already emitted in
	 * the current session.
	 */
	private readonly _dedupe: Uint8Array;
	/** Current dedupe session in [1..255]; 0 means cleared. */
	private _dedupeSession: number;

	/**
	 * Create a new walker.
	 *
	 * @param canvas  Canvas whose dimensions define linear indexing and dedupe size.
	 * @param mesh    Mesh providing `position` and `uv` attributes (Float32).
	 *                **Note:** `geometry.index` may exist (e.g. for BVH) but is **ignored**;
	 *                the walker reads attributes as **non-indexed** triplets via `faceIndex * 3`.
	 * @param canvasPositionsPerFace  Precomputed per-face flattened `(x,y)` pairs (Uint16).
	 * @param totalMappedUniquePixels Upper bound for any result set (union across all faces).
	 *
	 * @throws If `geometry.position` is not Float32 itemSize=3 or `geometry.uv` is not Float32 itemSize=2.
	 */
	constructor(
		canvas: HTMLCanvasElement,
		mesh: ThreeMesh,
		canvasPositionsPerFace: CanvasPositionsPerFace,
		totalMappedUniquePixels: number
	) {
		this._width = canvas.width;
		this._widthInverse = 1 / canvas.width;
		this._height = canvas.height;
		this._heightInverse = 1 / canvas.height;

		const geometry = mesh.geometry;

		const positionAttribute = geometry.getAttribute(
			"position"
		) as BufferAttribute;
		if (
			!positionAttribute ||
			positionAttribute.itemSize !== 3 ||
			!(positionAttribute.array instanceof Float32Array)
		) {
			console.log(positionAttribute);
			throw new Error(
				"CanvasPositionsWalker: geometry attribute 'position' (itemSize=3, Float32) is required."
			);
		}
		this._positions = positionAttribute.array as Float32Array;

		const uvAttribute = geometry.getAttribute("uv") as BufferAttribute;
		if (
			!uvAttribute ||
			uvAttribute.itemSize !== 2 ||
			!(uvAttribute.array instanceof Float32Array)
		) {
			throw new Error(
				"CanvasPositionsWalker: geometry 'uv' (itemSize=2, Float32) is required."
			);
		}
		this._uv = uvAttribute.array as Float32Array;

		this._canvasPositionsPerFace = canvasPositionsPerFace;

		// Output: sized to the deduped union; with dedupe, overflow cannot occur.
		this._out = new Uint32Array(totalMappedUniquePixels);
		this._outWritePosition = 0;

		// Dedupe session map (1 byte per pixel), initial session = 1.
		this._dedupe = new Uint8Array(this._width * this._height);
		this._dedupeSession = 1;
	}

	/**
	 * Canvas width in pixels.
	 */
	public get width(): number {
		return this._width;
	}

	/**
	 * Canvas height in pixels.
	 */
	public get height(): number {
		return this._height;
	}

	/**
	 * Begin a new deduplication session.
	 *
	 * Uses an O(1) **session bump** rather than clearing the dedupe array. When the session
	 * wraps (0 after increment), the dedupe array is bulk-cleared (0(n)).
	 *
	 * @remarks Call this at the start of each logical paint/selection pass.
	 */
	public startDedupeSession(): void {
		this._dedupeSession = (this._dedupeSession + 1) & 0xff;
		if (this._dedupeSession === 0) {
			this._dedupe.fill(0);
			this._dedupeSession = 1;
		}
	}

	/**
	 * Collect pixels from two face sets:
	 *
	 * - **contained** faces: collected completely (without duplications), or if `containedPredicate`
	 *   is provided, tested per pixel with that predicate.
	 * - **intersected** faces: always tested per pixel with `predicate`.
	 *
	 * **Input requirement:** `contained` and `intersected` must contain **non-indexed face indices**
	 * (already mapped so that `base = faceIndex * 3` addresses the correct three vertices/UVs).
	 *
	 * Pixels are deduplicated across both sets and emitted as **linear indices**.
	 *
	 * @param contained           Face indices appended without testing, unless a
	 *                            `containedPredicate` is provided.
	 * @param intersected         Face indices tested per pixel with `predicate`.
	 * @param predicate           Per-pixel test for `intersected` faces. Receives a reused
	 *                            `Vector3` in **mesh local space**, plus `(x, y, faceIndex)`.
	 * @param containedPredicate  Optional alternate per-pixel test for the `contained` set.
	 * @returns A **view** (`subarray`) into the internal `Uint32Array` of linear indices.
	 *
	 * @remarks The returned view becomes invalid after the next `collect()` call; copy it if needed.
	 */
	public collect(
		contained: ArrayLike<number>,
		intersected: ArrayLike<number>,
		predicate: Predicate,
		containedPredicate?: Predicate
	): Uint32Array {
		this._outWritePosition = 0;

		if (!containedPredicate) {
			this._collectFaces(contained);
		} else {
			for (let i = 0; i < contained.length; i++) {
				const faceIndex = contained[i];
				this._collectFaceWithPredicate(faceIndex, containedPredicate);
			}
		}

		for (let i = 0; i < intersected.length; i++) {
			const faceIndex = intersected[i];
			this._collectFaceWithPredicate(faceIndex, predicate);
		}

		return this._out.subarray(0, this._outWritePosition);
	}

	/**
	 * Append pixels from a set of faces without predicate testing.
	 *
	 * @internal Hot path: Uses unsafe segment accessors to avoid bounds checks.
	 */
	private _collectFaces(indices: ArrayLike<number>): void {
		const width = this._width;
		const dedupe = this._dedupe;
		const session = this._dedupeSession;
		const canvasPositions = this._canvasPositionsPerFace;
		const data = canvasPositions.unsafeData();

		let writePosition = this._outWritePosition;
		for (let i = 0; i < indices.length; i++) {
			const faceIndex = indices[i];
			const start = canvasPositions.unsafeSegmentStart(faceIndex);
			const end = canvasPositions.unsafeSegmentEnd(faceIndex);

			for (let j = start; j < end; j += 2) {
				const x = data[j];
				const y = data[j + 1];
				const index = x + y * width;
				if (dedupe[index] !== session) {
					dedupe[index] = session;
					this._out[writePosition++] = index;
				}
			}
		}

		this._outWritePosition = writePosition;
	}

	/**
	 * Collect pixels for a single face, evaluating a per-pixel 3D predicate.
	 *
	 * - Dedupe check is performed **before** barycentric math to skip already-seen pixels cheaply.
	 * - Positions/UVs are read directly from Float32 attributes.
	 * - Interpolation is performed via **UV-space barycentrics** to compute the local-space 3D point.
	 * - If world-space predicates need to be supported in the future, pre-transform A/B/C by
	 *   `matrixWorld` once per face and continue interpolating in world space.
	 *
	 * @param faceIndex Face index to walk.
	 * @param predicate Per-pixel predicate (receives a reused `Vector3` in **local space**).
	 *
	 * @internal Hot path: No per-pixel allocations.
	 */
	private _collectFaceWithPredicate(
		faceIndex: number,
		predicate: Predicate
	): void {
		const baseIndex = faceIndex * 3; // 3 positions per face

		// ---- load positions of the face ----
		const positions = this._positions;
		const positionsBase = baseIndex * 3; // 3 coordinates per position

		const Ax = positions[positionsBase];
		const Ay = positions[positionsBase + 1];
		const Az = positions[positionsBase + 2];

		const Bx = positions[positionsBase + 3];
		const By = positions[positionsBase + 4];
		const Bz = positions[positionsBase + 5];

		const Cx = positions[positionsBase + 6];
		const Cy = positions[positionsBase + 7];
		const Cz = positions[positionsBase + 8];

		// ---- load UVs of the face ----
		const uv = this._uv;
		const uvBase = baseIndex * 2; // 2 scalar components per uv

		const Au = uv[uvBase];
		const Av = uv[uvBase + 1];

		const Bu = uv[uvBase + 2];
		const Bv = uv[uvBase + 3];

		const Cu = uv[uvBase + 4];
		const Cv = uv[uvBase + 5];

		// ---- precompute barycentric in UV space ----
		const ABx = Bu - Au;
		const ABy = Bv - Av;
		const ACx = Cu - Au;
		const ACy = Cv - Av;

		const ABDotAB = ABx * ABx + ABy * ABy;
		const ABDotAC = ABx * ACx + ABy * ACy;
		const ACDotAC = ACx * ACx + ACy * ACy;

		const denominator = ABDotAB * ACDotAC - ABDotAC * ABDotAC;
		if (denominator === 0) {
			// degenerate UV triangle (likely yields empty segment)
			return;
		}
		const inverseDenominator = 1 / denominator;

		// ---- iterate face pixels ----
		const canvasPositions = this._canvasPositionsPerFace;
		const data = canvasPositions.unsafeData();
		const start = canvasPositions.unsafeSegmentStart(faceIndex);
		const end = canvasPositions.unsafeSegmentEnd(faceIndex);

		const width = this._width;
		const inverseWidth = this._widthInverse;
		const inverseHeight = this._heightInverse;

		const dedupe = this._dedupe;
		const session = this._dedupeSession;

		const currentPosition = this._currentPosition;

		let writePosition = this._outWritePosition;
		for (let i = start; i < end; i += 2) {
			const x = data[i];
			const y = data[i + 1];

			const index = x + y * width;
			if (dedupe[index] === session) {
				continue;
			}

			// canvas position to UV
			const positionU = x * inverseWidth;
			const positionV = 1 - y * inverseHeight;

			// AP = P - A  (in UV)
			const APx = positionU - Au;
			const APy = positionV - Av;

			const APdotAB = APx * ABx + APy * ABy;
			const APdotAC = APx * ACx + APy * ACy;

			// barycentric in UV basis
			const c =
				(ABDotAB * APdotAC - ABDotAC * APdotAB) * inverseDenominator;
			const b =
				(APdotAB * ACDotAC - APdotAC * ABDotAC) * inverseDenominator;
			const a = 1 - b - c;

			// interpolate 3D position (mesh local space)
			currentPosition.x = Ax * a + Bx * b + Cx * c;
			currentPosition.y = Ay * a + By * b + Cy * c;
			currentPosition.z = Az * a + Bz * b + Cz * c;

			if (predicate(currentPosition, x, y, faceIndex)) {
				dedupe[index] = session;
				this._out[writePosition++] = index;
			}
		}
		this._outWritePosition = writePosition;
	}

	/**
	 * Convert a canvas pixel position to a linear canvas index.
	 *
	 * Mapping:
	 *   index = x + y * width
	 *
	 * Notes:
	 * - No clamping or validation is performed; callers should ensure 0 <= x < width and 0 <= y < height.
	 * - Overloads accept either a Vector2 or scalar x,y. Returns the index as a number.
	 */
	public static canvasPositionToLinearIndex(
		pos: Vector2,
		width: number
	): number;
	public static canvasPositionToLinearIndex(
		x: number,
		y: number,
		width: number
	): number;
	public static canvasPositionToLinearIndex(
		xOrVector: number | Vector2,
		yOrWidth: number,
		maybeWidth?: number
	): number {
		if (typeof xOrVector === "number") {
			// Signature: (x, y, width)
			const x = xOrVector;
			const y = yOrWidth;
			const w = maybeWidth!;
			return x + y * w;
		} else {
			// Signature: (pos, width)
			const pos = xOrVector;
			const w = yOrWidth;
			return pos.x + pos.y * w;
		}
	}

	/**
	 * Convert a flattened canvas-positions array [x1, y1, x2, y2, ...] to a new
	 * Uint32Array of linear indices (x + y * width).
	 *
	 * Notes:
	 * - No clamping or range validation is performed.
	 * - The input length must be even; each pair is interpreted as one pixel.
	 *
	 * @param pairs  Flattened [x,y] sequence (even length).
	 * @param width  Canvas width used to compute linear indices.
	 * @returns      Uint32Array of length pairs.length / 2 with linear indices.
	 */
	public static canvasPositionsToLinearIndices(
		pairs: ArrayLike<number>,
		width: number
	): Uint32Array {
		const n = pairs.length;
		if ((n & 1) !== 0) {
			throw new Error(
				"CanvasPositionsWalker: flattened positions length must be even [x,y,...]."
			);
		}

		const count = n >>> 1; // n / 2
		const out = new Uint32Array(count);

		for (let i = 0, j = 0; i < count; i++, j += 2) {
			out[i] = pairs[j] + pairs[j + 1] * width;
		}

		return out;
	}
}
