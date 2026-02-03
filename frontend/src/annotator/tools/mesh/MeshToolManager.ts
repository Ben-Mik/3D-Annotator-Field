import { type Mesh } from "~annotator/scene/model/Mesh";
import { type Tool } from "../Tool";
import { ToolManager } from "../ToolManager";
import { MeshBrush3D } from "./brush_3D/MeshBrush3D";
import { MeshFill } from "./fill/MeshFill";
import { MeshLasso } from "./lasso/MeshLasso";
import { MeshPolygon } from "./polygon/MeshPolygon";

/**
 * A Manager for all mesh tools
 */
export class MeshToolManager extends ToolManager<Mesh> {
	/**
	 * Creates all tools compatible with the model type {@link Mesh}
	 *
	 * @returns the array of tools
	 */
	protected createTools(): Tool<Mesh>[] {
		return [
			new MeshBrush3D(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new MeshLasso(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new MeshPolygon(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
			new MeshFill(
				this.annotationManager,
				this.undoManager,
				this.scene,
				this.sharedSelectionBuffer
			),
		];
	}
}
