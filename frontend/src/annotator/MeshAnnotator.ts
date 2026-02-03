import type { ModelType } from "~entity/ModelInformation";
import { type AnnotationManager } from "./annotation/AnnotationManager";
import type { LabelManager } from "./annotation/LabelManager";
import { type UndoManager } from "./annotation/undo/UndoManager";
import { Annotator } from "./Annotator";
import { MeshAnnotatorSettingsView } from "./MeshAnnotatorSettings";
import { MeshScene } from "./scene/MeshScene";
import { type Mesh } from "./scene/model/Mesh";
import { type Scene } from "./scene/Scene";
import { type AnnotationVisualizer } from "./scene/visualizer/AnnotationVisualizer";
import { MeshAnnotationVisualizer } from "./scene/visualizer/MeshAnnotationVisualizer";
import { MeshToolManager } from "./tools/mesh/MeshToolManager";
import { type ToolManager } from "./tools/ToolManager";

/**
 * The Annotator for Meshes
 */
export class MeshAnnotator extends Annotator<Mesh> {
	public declare modelType: ModelType.MESH;

	public override isMeshAnnotator(): this is MeshAnnotator {
		return true;
	}

	public override getSettingsComponent() {
		return MeshAnnotatorSettingsView;
	}

	protected createToolManager(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<Mesh>
	): ToolManager<Mesh> {
		return new MeshToolManager(annotationManager, undoManager, scene);
	}

	protected override createScene(sceneParent: HTMLDivElement): Scene<Mesh> {
		return new MeshScene(this.cacheScope, sceneParent);
	}

	protected override onInitializedModel(): void {
		// nothing to do
	}

	protected override createAnnotationVisualizer(
		scene: Scene<Mesh>,
		labelManager: LabelManager
	): AnnotationVisualizer {
		return new MeshAnnotationVisualizer(scene, labelManager);
	}
}
