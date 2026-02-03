import { type AnnotationManager } from "~annotator/annotation/AnnotationManager";
import { type UndoManager } from "~annotator/annotation/undo/UndoManager";
import { type Scene } from "~annotator/scene/Scene";
import { type Model } from "~annotator/scene/model/Model";
import { type Destroyable } from "~entity/Types";
import { EventManager } from "~events/EventManager";
import { type Subscribable, type Unsubscribe } from "~events/Events";
import { type Tool } from "./Tool";
import { SelectionBuffer } from "./common/utils/SelectionBuffer";

export type ToolManagerEvents = {
	selected: Tool<Model> | undefined;
};

/**
 * Manages tools compatible to the model type T
 */
export abstract class ToolManager<M extends Model>
	implements Subscribable<ToolManagerEvents>, Destroyable
{
	private readonly eventManager = new EventManager<ToolManagerEvents>();
	public on = this.eventManager.on.bind(this.eventManager);

	protected readonly annotationManager: AnnotationManager;
	protected readonly undoManager: UndoManager;
	protected readonly scene: Scene<M>;
	protected readonly sharedSelectionBuffer: SelectionBuffer;

	private readonly tools: Tool<M>[];
	private current?: Tool<M>;

	private unsubscribeFromScene?: Unsubscribe;

	/**
	 * Constructs a new instance of ToolManager
	 *
	 * @param annotationManager an AnnotationManager
	 * @param scene a scene
	 */
	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<M>
	) {
		this.annotationManager = annotationManager;
		this.undoManager = undoManager;
		this.scene = scene;
		this.sharedSelectionBuffer = new SelectionBuffer(
			scene.getModel().getModelSize()
		);
		this.tools = this.initializeTools();
	}

	/**
	 * Initializes all tools by calling load on each of them
	 *
	 * @returns an array of tools of type T
	 */
	private initializeTools(): Tool<M>[] {
		const tools = this.createTools();
		for (const tool of tools) {
			tool.load();
		}
		return tools;
	}

	/**
	 * Disposes all tools
	 */
	public destroy(): void {
		this.eventManager.destroy();
		for (const tool of this.tools) {
			tool.destroy();
		}
	}

	/**
	 * Creates all tools of the generic type T
	 */
	protected abstract createTools(): Tool<M>[];

	/**
	 * Returns an copy of all tools managed by this manager
	 *
	 * @returns an array of tools
	 */
	public getTools(): Tool<M>[] {
		return [...this.tools];
	}

	/**
	 * Selects an tool from this manager
	 *
	 * @param tool the tool
	 */
	public selectTool(tool: Tool<M>): void {
		if (!this.tools.includes(tool)) {
			throw new Error("'tool' not found in ToolManager");
		}

		if (this.current) {
			this.unselectCurrent();
		}

		this.current = tool;
		this.selectCurrent();
		this.eventManager.emit("selected", this.current);
	}

	/**
	 * Unselects the current tool.
	 * If no tool is selected nothing happens.
	 *
	 * @return the unselected tool or undefined if no tool was selected
	 */
	public unselectCurrentTool(): Tool<M> | undefined {
		const currentTool = this.current;
		if (this.current) {
			this.unselectCurrent();
			this.current = undefined;
		}
		this.eventManager.emit("selected", this.current);
		return currentTool;
	}

	/**
	 * Selects the current tool
	 */
	private selectCurrent(): void {
		this.current!.select();
		const observer = this.current!.update.bind(this.current);
		const unsubscribe = this.scene.on("beforeRender", observer);
		this.unsubscribeFromScene = unsubscribe;
	}

	/**
	 * Unselects the current tool
	 */
	private unselectCurrent(): void {
		this.current!.unselect();
		if (this.unsubscribeFromScene) {
			this.unsubscribeFromScene();
		}
	}
}
