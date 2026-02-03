import { type Texture, type Mesh as ThreeMesh } from "three";
import type { BufferGeometry } from "three/src/Three";
import { MeshBuilder } from "./builder/MeshBuilder";
import { MeshTypeModel } from "./MeshTypeModel";

/**
 * A Mesh Model
 */
export class Mesh extends MeshTypeModel {
	protected override isCached(): Promise<boolean> {
		return MeshBuilder.isCached(this.cacheScope);
	}

	protected override async onModelLoaded(
		geometry?: BufferGeometry,
		texture?: Texture
	): Promise<[ThreeMesh, number]> {
		const builder = new MeshBuilder(this.cacheScope);
		const mesh = await builder.build(geometry, texture);

		const indexCount =
			(mesh.geometry.getAttribute("position").count / 3) | 0;
		return [mesh, indexCount];
	}
}
