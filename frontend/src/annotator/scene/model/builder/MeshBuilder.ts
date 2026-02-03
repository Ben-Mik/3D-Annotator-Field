import {
	BufferAttribute,
	MeshPhongMaterial,
	Mesh as ThreeMesh,
	type BufferGeometry,
	type Material,
	type Texture,
} from "three";
import { createMainThreadCacheRuntime, type CacheScope } from "~cache/index";
import { ColorSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { getBufferGeometryInfo } from "~util/Three";
import { wait } from "~util/Timeout";
import { BUILDER_RESULT_RESOURCE } from "./BuilderResultResource";
import { NonBlockingBVHBuilder } from "./bvh/NonBlockingBVHBuilder";

/**
 * - defaultMaterialColor: The color used for meshes if they do not have any color values or a texture. Changes to this setting only take affect after rebuilding.
 */
export const MESH_BUILDER_SETTINGS = {
	defaultMaterialColor: new ColorSetting("defaultMaterialColor", 0xcccccc),
};

const settingsRegistry = new LocalStorageSettingsRegistry("meshBuilder-n9mCD");
settingsRegistry.registerMultiple(MESH_BUILDER_SETTINGS);

/**
 * Builds a Mesh model
 */
export class MeshBuilder {
	private readonly cacheScope: CacheScope;

	/**
	 * constructs a new MeshBuilder Instance.
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
	): Promise<ThreeMesh> {
		await wait();

		let geometry: BufferGeometry;

		const cacheRuntime = await createMainThreadCacheRuntime();
		const cacheSession = cacheRuntime.getSession(this.cacheScope);

		if (bufferGeometry) {
			geometry = bufferGeometry;

			if (texture && geometry.hasAttribute("color")) {
				console.warn(
					"Mesh has a texture and color values. Color values will be ignored..."
				);
				geometry.deleteAttribute("color");
			}

			if (
				geometry.hasAttribute("color") &&
				geometry.getAttribute("color").itemSize !== 3
			) {
				console.warn(
					`Mesh color attribute has an unsupported item size (${
						geometry.getAttribute("color").itemSize
					}). Color values will be ignored...`
				);
				geometry.deleteAttribute("color");
			}

			await wait();

			const count = geometry.attributes.position.count;

			let colorAttribute: BufferAttribute;
			if (!geometry.hasAttribute("color")) {
				const colors = new Float32Array(count * 4);
				colorAttribute = new BufferAttribute(colors, 4);
				geometry.setAttribute("color", colorAttribute);
			}

			await wait();

			const bvhBuilder = new NonBlockingBVHBuilder();
			const bvh = await bvhBuilder.build(geometry);
			bvhBuilder.destroy();
			geometry.boundsTree = bvh;

			geometry.addGroup(0, Infinity, 0);
			geometry.addGroup(0, Infinity, 1);

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

		console.log("Mesh:\n" + getBufferGeometryInfo(geometry));

		let material: Material;
		if (texture) {
			material = new MeshPhongMaterial({
				map: texture,
			});
		} else {
			material = new MeshPhongMaterial({
				color: MESH_BUILDER_SETTINGS.defaultMaterialColor.get(),
			});
		}
		material.vertexColors = false;
		material.transparent = false;

		const vertexMaterial = new MeshPhongMaterial();
		vertexMaterial.vertexColors = true;
		vertexMaterial.transparent = true;

		await wait();
		const mesh = new ThreeMesh(geometry, [material, vertexMaterial]);

		return Promise.resolve(mesh);
	}

	public static async isCached(scope: CacheScope) {
		const cacheRuntime = await createMainThreadCacheRuntime();
		const cacheSession = cacheRuntime.getSession(scope);
		return await cacheSession.has(BUILDER_RESULT_RESOURCE);
	}
}
