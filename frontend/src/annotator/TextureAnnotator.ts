import { type ModelType } from "~entity/ModelInformation";
import { type AnnotationManager } from "./annotation/AnnotationManager";
import type { LabelManager } from "./annotation/LabelManager";
import { type UndoManager } from "./annotation/undo/UndoManager";
import { type DbLinkManager } from "~dblink/DbLinkManager";
import { Annotator } from "./Annotator";
import type { TextureMesh } from "./scene/model/TextureMesh";
import { type Scene } from "./scene/Scene";
import { TextureMeshScene } from "./scene/TextureMeshScene";
import { type AnnotationVisualizer } from "./scene/visualizer/AnnotationVisualizer";
import { TextureAnnotationVisualizer } from "./scene/visualizer/TextureAnnotationVisualizer";
import { TextureAnnotatorSettingsView } from "./TextureAnnotatorSettings";
import { TextureToolManager } from "./tools/texture/TextureToolManager";
import { type ToolManager } from "./tools/ToolManager";

/**
 * The Annotator for Meshes
 */
export class TextureAnnotator extends Annotator<TextureMesh> {
	public declare modelType: ModelType.TEXTURE_MESH;

	protected declare annotationVisualizer: TextureAnnotationVisualizer;

	public override isTextureAnnotator(): this is TextureAnnotator {
		return true;
	}

	public override getSettingsComponent() {
		return TextureAnnotatorSettingsView;
	}

	protected override createToolManager(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<TextureMesh>,
		dbLinkManager: DbLinkManager | null
	): ToolManager<TextureMesh> {
		return new TextureToolManager(
			annotationManager,
			undoManager,
			scene,
			dbLinkManager
		);
	}

	protected override createScene(
		sceneParent: HTMLDivElement
	): Scene<TextureMesh> {
		return new TextureMeshScene(this.cacheScope, sceneParent);
	}

	protected override onInitializedModel(scene: Scene<TextureMesh>): void {
		const mesh = scene.getModel();
		const walker = mesh.getCanvasPositionsWalker();
		this.labelManager.on(["activeLabelChange", "lockChange"], () => {
			walker.startDedupeSession();
		});
		this.undoManager.on(["undo", "redo"], () => {
			walker.startDedupeSession();
		});
	}

	protected override createAnnotationVisualizer(
		scene: Scene<TextureMesh>,
		labelManager: LabelManager
	): AnnotationVisualizer {
		return new TextureAnnotationVisualizer(scene, labelManager);
	}

	public override async save() {
		const stats = this.scene.getModel().getTextureStats();
		const width = stats.width;
		const height = stats.height;
		const data = this.annotationManager.getAnnotationDataLUT();
		await this.annotationFileManager.writeAnnotationData(
			data,
			width,
			height
		);
	}

	public getDimensions() {
		const stats = this.scene.getModel().getTextureStats();
		const width = stats.width;
		const height = stats.height;
		return { width, height };
	}

	public getOriginalColors() {
		return this.annotationVisualizer.getOriginalColors();
	}
}
