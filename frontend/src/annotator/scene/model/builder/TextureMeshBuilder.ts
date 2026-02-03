import {
	CanvasTexture,
	MeshPhongMaterial,
	MirroredRepeatWrapping,
	NearestFilter,
	Mesh as ThreeMesh,
	UVMapping,
	type BufferGeometry,
	type Texture,
} from "three";
import { createMainThreadCacheRuntime, type CacheScope } from "~cache/index";
import { getBufferGeometryInfo } from "~util/Three";
import { wait } from "~util/Timeout";
import type { CanvasPositionsPerFace } from "../TextureMesh";
import { BUILDER_RESULT_RESOURCE } from "./BuilderResultResource";
import { NonBlockingBVHBuilder } from "./bvh/NonBlockingBVHBuilder";
import { FaceCanvasPositionMapper } from "./texture/FaceCanvasPositionMapper";
import {
	getPrintableTextureStats,
	type TextureStats,
} from "./texture/TextureStats";

/**
 * Builds a TextureMesh model.
 */
export class TextureMeshBuilder {
	private readonly cacheScope: CacheScope;

	/**
	 * Constructs a new TextureMeshBuilder Instance.
	 */
	constructor(scope: CacheScope) {
		this.cacheScope = scope;
	}

	/**
	 * Builds the {@link ThreeMesh} out of the {@link BufferGeometry} and the optional {@link Texture} which were defined in the constructor.
	 *
	 * If the mesh has a texture and a color attribute, the color attribute will be ignored.
	 *
	 * If the mesh has a color attribute with an item size other than 3, the color attribute will be ignored.
	 *
	 * If the mesh has no color attribute or if the color attribute was ignored, a new color attribute with an item size of 4 will be created.
	 *
	 * @returns the build Mesh
	 */
	public async build(
		bufferGeometry?: BufferGeometry,
		texture?: Texture
	): Promise<{
		mesh: ThreeMesh;
		canvas: HTMLCanvasElement;
		context: CanvasRenderingContext2D;
		canvasTexture: CanvasTexture;
		canvasPositionsPerFace: CanvasPositionsPerFace;
		textureStats: TextureStats;
	}> {
		if (!texture) {
			throw Error("Mesh in texture mode needs a texture");
		}

		await wait();

		let geometry: BufferGeometry;

		const cacheRuntime = await createMainThreadCacheRuntime();
		const cacheSession = cacheRuntime.getSession(this.cacheScope);

		if (bufferGeometry) {
			geometry = bufferGeometry;

			if (geometry.hasAttribute("color")) {
				console.warn(
					"Mesh is in texture mode and has color values. Color values will be ignored..."
				);
				geometry.deleteAttribute("color");
			}

			await wait();

			const bvhBuilder = new NonBlockingBVHBuilder();
			const bvh = await bvhBuilder.build(geometry);
			bvhBuilder.destroy();
			geometry.boundsTree = bvh;

			geometry.addGroup(0, Infinity, 0);

			await cacheSession.write(BUILDER_RESULT_RESOURCE, geometry);

			console.log(`Saved to cache: ${BUILDER_RESULT_RESOURCE.id}`);
		} else {
			if (await cacheSession.has(BUILDER_RESULT_RESOURCE)) {
				// todo: handle null (cache version mismatch...)
				geometry = (await cacheSession.read(BUILDER_RESULT_RESOURCE))!;

				console.log(
					`Retrieved from cache: ${BUILDER_RESULT_RESOURCE.id}`
				);
			} else {
				throw new Error("No geometry provided ");
			}
		}

		console.log("TextureMesh:\n" + getBufferGeometryInfo(geometry));

		const image = texture.image as ImageBitmap;
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const canvasTexture = new CanvasTexture(
			canvas,
			UVMapping,
			MirroredRepeatWrapping,
			MirroredRepeatWrapping,
			NearestFilter
		);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Could not create canvas context!");
		}
		context.drawImage(image, 0, 0);
		canvasTexture.needsUpdate = true;

		const material = new MeshPhongMaterial({
			map: canvasTexture,
		});

		await wait();

		const mesh = new ThreeMesh(geometry, [material]);

		const time = performance.now();

		const mapper = new FaceCanvasPositionMapper(this.cacheScope);
		const { canvasPositionsPerFace, textureStats } = await mapper.build(
			mesh,
			canvas.width,
			canvas.height
		);
		mapper.destroy();

		console.log(
			`FaceCanvasPositionMapper: Finished in ${(
				(performance.now() - time) /
				1000
			).toPrecision(2)}s`,
			getPrintableTextureStats(textureStats)
		);

		return Promise.resolve({
			mesh,
			canvas,
			context,
			canvasTexture,
			canvasPositionsPerFace,
			textureStats,
		});
	}

	public static async isCached(scope: CacheScope) {
		const cacheRuntime = await createMainThreadCacheRuntime();
		const cacheSession = cacheRuntime.getSession(scope);
		return await cacheSession.has(BUILDER_RESULT_RESOURCE);
	}
}
