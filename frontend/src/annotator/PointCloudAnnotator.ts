import { type ModelType } from "~entity/ModelInformation";
import { type AnnotationManager } from "./annotation/AnnotationManager";
import type { LabelManager } from "./annotation/LabelManager";
import { type UndoManager } from "./annotation/undo/UndoManager";
import { Annotator } from "./Annotator";
import { PointCloudAnnotatorSettingsView } from "./PointCloudAnnotatorSettings";
import { type PointCloud } from "./scene/model/PointCloud";
import { PointCloudScene } from "./scene/PointCloudScene";
import { type Scene } from "./scene/Scene";
import { type AnnotationVisualizer } from "./scene/visualizer/AnnotationVisualizer";
import { PointCloudAnnotationVisualizer } from "./scene/visualizer/PointCloudAnnotationVisualizer";
import { PointCloudToolManager } from "./tools/point_cloud/PointCloudToolManager";
import { type ToolManager } from "./tools/ToolManager";

/**
 * The Annotator for PointClouds
 */
export class PointCloudAnnotator extends Annotator<PointCloud> {
	public declare modelType: ModelType.POINT_CLOUD;

	public override isPointCloudAnnotator(): this is PointCloudAnnotator {
		return true;
	}

	public override getSettingsComponent() {
		return PointCloudAnnotatorSettingsView;
	}

	protected createToolManager(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<PointCloud>
	): ToolManager<PointCloud> {
		return new PointCloudToolManager(annotationManager, undoManager, scene);
	}

	protected override createScene(
		sceneParent: HTMLDivElement
	): Scene<PointCloud> {
		return new PointCloudScene(this.cacheScope, sceneParent);
	}

	protected override onInitializedModel(): void {
		// nothing to do
	}

	protected override createAnnotationVisualizer(
		scene: Scene<PointCloud>,
		labelManager: LabelManager
	): AnnotationVisualizer {
		return new PointCloudAnnotationVisualizer(scene, labelManager);
	}
}
