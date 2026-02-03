/**
 * Aggregate statistics about a texture and its UV-to-canvas coverage.
 */
export interface TextureStats {
	/** Texture width in pixels (canvas X dimension). */
	width: number;

	/** Texture height in pixels (canvas Y dimension). */
	height: number;

	/** Total number of canvas pixels: width * height. */
	pixelCount: number;

	/**
	 * Sum of per-face mapped pixels, counting overlaps.
	 * If multiple faces map to the same pixel, each face contributes to this sum.
	 */
	mappedPixelCountWithOverlaps: number;

	/** Count of distinct canvas pixels covered by any face (deduplicated across faces). */
	mappedUniquePixelCount: number;

	/** Number of faces in the mesh (non-indexed face space). */
	faceCount: number;

	/** Number of faces that contribute at least 2 mapped pixels. */
	mappedFaceCount: number;

	/**
	 * Ratio of mapped faces to total faces in [0, 1]:
	 * mappedFaceRatio = mappedFaceCount / faceCount.
	 */
	mappedFaceRatio: number;

	/**
	 * UV coverage ratio in [0, 1]: totalMappedUniquePixelCount / totalPixelCount.
	 * Represents the fraction of the canvas touched by at least one face.
	 */
	coverage: number;

	/**
	 * Overdraw factor: mappedPixelCountWithOverlaps / totalMappedUniquePixelCount.
	 * Interpreted as the average number of overlapping face layers per covered pixel.
	 * Equals 1 when there is no overlap; > 1 when faces overlap in UV space.
	 */
	overdraw: number;

	/**
	 * Average mapped pixels per face, computed over faces with at least 2 mapped pixels.
	 */
	averagePixelsPerFace: number;
}

/**
 * Pre-computed face-level stats for a subset of faces.
 */
export interface ChunkFaceStats {
	/** Number of faces in this chunk */
	faceCount: number;
	/** Number of faces in this chunk with >= 2 mapped pixels */
	mappedFaceCount: number;
	/** Sum of all pixels in this chunk (with overlaps) */
	mappedPixelCountWithOverlaps: number;
	/** Sum of pixels only for mapped faces in this chunk */
	mappedPixelCountOnMappedFaces: number;
}

/**
 * Lookup table of population counts (number of set bits) for all 8-bit values.
 *
 * Precomputed once at module load using Brian Kernighan's bit trick (`x &= x - 1`).
 * Enables fast, branchless popcount over arbitrary buffers by summing per-byte counts.
 */
const POPCOUNT_8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
	let x = i,
		c = 0;
	while (x) {
		x &= x - 1;
		c++;
	}
	POPCOUNT_8[i] = c;
}

/**
 * Builds aggregate `TextureStats` by processing chunks of rasterization data.
 *
 * This builder is stateful. It provides methods to:
 * 1. Merge face-level stats computed for subsets of faces (`addFaceStats`).
 * 2. Process pixel data chunks to build a unique pixel bitmap (`processPixelDataChunk`).
 * 3. Finalize all statistics (`finalize`).
 */
export class TextureStatsBuilder {
	private readonly width: number;
	private readonly height: number;
	private readonly totalPixelCount: number;

	// 1-bit-per-pixel coverage bitmap
	private readonly bitmap: Uint32Array;

	// Class-level accumulators
	private totalFaceCount = 0; // number of faces seen
	private totalMappedFaceCount = 0; // faces with #pixels >= 2
	private totalMappedPixelCountWithOverlaps = 0; // sum over faces with overlaps
	private totalMappedPixelCountOnMappedFaces = 0; // sum over faces with len >= 2

	/**
	 * Creates a new TextureStatsBuilder.
	 * @param width - Canvas width in pixels.
	 * @param height - Canvas height in pixels.
	 */
	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.totalPixelCount = width * height;

		const words = Math.ceil(this.totalPixelCount / 32);
		this.bitmap = new Uint32Array(words);
	}

	/**
	 * Merges pre-calculated face stats from a worker chunk into the builder's total.
	 * This is a fast, additive operation.
	 *
	 * @param stats - The `ChunkFaceStats` computed by a sub-worker.
	 */
	public addFaceStats(stats: ChunkFaceStats): void {
		this.totalFaceCount += stats.faceCount;
		this.totalMappedFaceCount += stats.mappedFaceCount;
		this.totalMappedPixelCountWithOverlaps +=
			stats.mappedPixelCountWithOverlaps;
		this.totalMappedPixelCountOnMappedFaces +=
			stats.mappedPixelCountOnMappedFaces;
	}

	/**
	 * Processes an array of pixel data to update the internal unique pixel bitmap.
	 *
	 * @param data - A Uint16Array of pixel data ([x,y,x,y...])
	 */
	public processPixelData(data: Uint16Array): void {
		const width = this.width;
		const bitmap = this.bitmap;
		for (let i = 0; i < data.length; i += 2) {
			const x = data[i];
			const y = data[i + 1];
			const bitIndex = x + y * width;
			const word = bitIndex >>> 5;
			const mask = 1 << (bitIndex & 31);
			bitmap[word] |= mask;
		}
	}

	/**
	 * Produce the final `TextureStats` from all accumulated data.
	 *
	 * @param faceCount Optional authoritative total face count; if omitted, uses the accumulated value.
	 * @returns The final `TextureStats` object.
	 */
	public finalize(faceCount?: number): TextureStats {
		const finalFaceCount = faceCount ?? this.totalFaceCount;

		// Popcount bitmap by bytes
		const bytes = new Uint8Array(
			this.bitmap.buffer,
			this.bitmap.byteOffset,
			this.bitmap.byteLength
		);
		let unique = 0;
		for (let i = 0; i < bytes.length; i++) {
			unique += POPCOUNT_8[bytes[i]];
		}

		const coverage = unique / this.totalPixelCount;
		const overdraw = this.totalMappedPixelCountWithOverlaps / unique;
		const mappedFaceRatio = this.totalMappedFaceCount / finalFaceCount;
		const averagePixelsPerFace =
			this.totalMappedPixelCountOnMappedFaces / this.totalMappedFaceCount;
		return {
			width: this.width,
			height: this.height,
			pixelCount: this.totalPixelCount,
			mappedPixelCountWithOverlaps:
				this.totalMappedPixelCountWithOverlaps,
			mappedUniquePixelCount: unique,
			faceCount: finalFaceCount,
			mappedFaceCount: this.totalMappedFaceCount,
			mappedFaceRatio,
			coverage,
			overdraw,
			averagePixelsPerFace,
		};
	}

	/**
	 * Calculates face-level stats for a *single chunk* based on its
	 * corresponding slice of the global face-item-counts array.
	 *
	 * This is a static "pure" function designed to be called by sub-workers.
	 *
	 * @param facePixelCounts - The array of pixel count per face.
	 * @returns A `ChunkFaceStats` object for this specific chunk.
	 */
	public static calculateChunkStats(
		facePixelCounts: Uint32Array
	): ChunkFaceStats {
		let mappedFaceCount = 0;
		let mappedPixelCountWithOverlaps = 0;
		let mappedPixelCountOnMappedFaces = 0;

		for (let i = 0; i < facePixelCounts.length; i++) {
			const pixelCount = facePixelCounts[i];

			mappedPixelCountWithOverlaps += pixelCount;

			// A face is "mapped" if it has at least two pixels
			if (pixelCount >= 2) {
				mappedFaceCount++;
				mappedPixelCountOnMappedFaces += pixelCount;
			}
		}
		return {
			faceCount: facePixelCounts.length,
			mappedFaceCount,
			mappedPixelCountOnMappedFaces,
			mappedPixelCountWithOverlaps,
		};
	}
}

/**
 * Format TextureStats as a compact, console-friendly multi-line string.
 */
export function getPrintableTextureStats(stats: TextureStats): string {
	const {
		width,
		height,
		pixelCount: totalPixelCount,
		mappedPixelCountWithOverlaps: totalMappedPixelCount,
		mappedUniquePixelCount: totalMappedUniquePixelCount,
		faceCount,
		mappedFaceCount,
		mappedFaceRatio,
		coverage,
		overdraw,
		averagePixelsPerFace,
	} = stats;

	const int = (n: number) => n.toLocaleString();
	const pct = (v: number) =>
		Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "n/a";
	const pad = (s: string, w: number) =>
		s.length >= w ? s : s + " ".repeat(w - s.length);
	const l = 14;

	const lines = [
		`${pad("Texture", l)}${int(width)} x ${int(height)}`,
		`${pad("Pixels", l)}${int(totalPixelCount)}`,
		"",
		`${pad("Coverage", l)}${pct(coverage)}  (${int(
			totalMappedUniquePixelCount
		)} unique)`,
		`${pad("Overdraw", l)}x${overdraw.toFixed(2)}  (${int(
			totalMappedPixelCount
		)} mapped)`,
		"",
		`${pad("Faces", l)}${int(faceCount)} total`,
		`${pad("Mapped", l)}${int(mappedFaceCount)}  (${pct(mappedFaceRatio)})`,
		`${pad("Avg px/face", l)}${averagePixelsPerFace.toFixed(
			2
		)}  (*mapped >= 2 px)`,
	];

	return lines.join("\n");
}
