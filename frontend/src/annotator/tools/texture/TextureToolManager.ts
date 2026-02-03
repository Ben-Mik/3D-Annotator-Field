import type { TextureMesh } from "~annotator/scene/model/TextureMesh";
import { type Tool } from "../Tool";
import { ToolManager } from "../ToolManager";
import { TextureBrush3D } from "./brush_3D/TextureBrush3D";
import { TextureFill } from "./fill/TextureFill";
import { TextureLasso } from "./lasso/TextureLasso";
import { TexturePixel } from "./pixel/TexturePixel";
import { TexturePolygon } from "./polygon/TexturePolygon";
import { TextureTriangle } from "./triangle/TextureTriangle";

/**
 * A Manager for all mesh tools
 */
export class TextureToolManager extends ToolManager<TextureMesh> {
	/**
	 * Creates all tools compatible with the model type {@link Mesh}
	 *
	 * @returns the array of tools
	 */
	protected createTools(): Tool<TextureMesh>[] {
		return [
			new TexturePixel(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new TextureTriangle(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new TextureBrush3D(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new TextureLasso(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new TexturePolygon(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new TextureFill(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
		];
	}
}
