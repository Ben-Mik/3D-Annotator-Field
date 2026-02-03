import {
	type CanvasTexture,
	type Texture,
	type Mesh as ThreeMesh,
} from "three";
import type { BufferGeometry } from "three/src/Three";
import { CanvasPositionsWalker } from "~annotator/tools/common/texture/CanvasPositionsWalker";
import type { ReadonlySegmentedArray } from "~util/datastructures/SegmentedArray";
import type { TextureStats } from "./builder/texture/TextureStats";
import { TextureMeshBuilder } from "./builder/TextureMeshBuilder";
import { MeshTypeModel } from "./MeshTypeModel";
import { MODEL_FIELD_ACCESS_ERROR_MESSAGE } from "./Model";

/**
 * A flattened array of multiple canvas positions, i.e. [x0, y0, x1, y1, ...].
 */
export type CanvasPositions = ArrayLike<number>;

/**
 * The canvas positions of each face.
 */
export type CanvasPositionsPerFace = ReadonlySegmentedArray<Uint16Array>;

/**
 * A Mesh Model
 */
export class TextureMesh extends MeshTypeModel {
	private canvas?: HTMLCanvasElement;
	private canvasContext?: CanvasRenderingContext2D;
	private canvasTexture?: CanvasTexture;
	private textureStats?: TextureStats;
	private canvasPositionsPerFace?: CanvasPositionsPerFace;
	private canvasPositionsWalker?: CanvasPositionsWalker;

	public getCanvas() {
		if (!this.canvas) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.canvas;
	}

	public getCanvasContext() {
		if (!this.canvasContext) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.canvasContext;
	}

	public getCanvasTexture() {
		if (!this.canvasTexture) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.canvasTexture;
	}

	public getCanvasPositionsPerFace(): CanvasPositionsPerFace {
		if (!this.canvasPositionsPerFace) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.canvasPositionsPerFace;
	}

	public getCanvasPositionsWalker(): CanvasPositionsWalker {
		if (!this.canvasPositionsWalker) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.canvasPositionsWalker;
	}

	public getTextureStats(): TextureStats {
		if (!this.textureStats) {
			throw new Error(MODEL_FIELD_ACCESS_ERROR_MESSAGE);
		}

		return this.textureStats;
	}

	protected override isCached(): Promise<boolean> {
		return TextureMeshBuilder.isCached(this.cacheScope);
	}

	protected override async onModelLoaded(
		geometry?: BufferGeometry,
		texture?: Texture
	): Promise<[ThreeMesh, number]> {
		const builder = new TextureMeshBuilder(this.cacheScope);
		const {
			mesh,
			canvas,
			context,
			canvasTexture,
			canvasPositionsPerFace,
			textureStats,
		} = await builder.build(geometry, texture);
		this.canvas = canvas;
		this.canvasContext = context;
		this.canvasTexture = canvasTexture;
		this.textureStats = textureStats;
		this.canvasPositionsPerFace = canvasPositionsPerFace;
		this.canvasPositionsWalker = new CanvasPositionsWalker(
			canvas,
			mesh,
			canvasPositionsPerFace,
			textureStats.mappedUniquePixelCount
		);

		return [mesh, textureStats.pixelCount];
	}
}
