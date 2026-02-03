import { TextureMesh } from "./model/TextureMesh";
import { Scene } from "./Scene";

/**
 * A Scene for a mesh
 */
export class TextureMeshScene extends Scene<TextureMesh> {
	protected createModel(): TextureMesh {
		return new TextureMesh(this.cacheScope);
	}
}
