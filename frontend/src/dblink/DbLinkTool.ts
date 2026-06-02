import type { FC } from "react";
import { Raycaster, Vector2 } from "three";
import type { AnnotationManager } from "~annotator/annotation/AnnotationManager";
import type { UndoManager } from "~annotator/annotation/undo/UndoManager";
import { type DbLinkManager } from "./DbLinkManager";
import type { Scene } from "~annotator/scene/Scene";
import type { Model } from "~annotator/scene/model/Model";
import { type ListenerBundle } from "~annotator/tools/common/listener/Listener";
import type { SelectionBuffer } from "~annotator/tools/common/utils/SelectionBuffer";
import {
	Tool,
	type ToolButtonProps,
	type ToolQuickSettingsProps,
} from "~annotator/tools/Tool";
import { DbLinkToolButton } from "./DbLinkToolButton";

const NAME = "DB_LINK";

/**
 * The DB-link tool. Active behaviours (only fire when this tool is the
 * current one):
 *
 *  - Click on empty model → raycast to find a hit point, create a
 *    provisional point, open the LinkingWindow.
 *
 *  Selection, drag-to-move, and delete are added in the next task.
 */
export class DbLinkTool<M extends Model> extends Tool<M> {
	private readonly dbLinkManager: DbLinkManager;
	private readonly raycaster = new Raycaster();
	private readonly ndc = new Vector2();

	/**
	 * Cached so register/unregister see the *same* listener reference. If we
	 * built a fresh bundle in `getOnSelectedListenerBundles()`, each `.bind`
	 * call would create a new function and `removeEventListener` couldn't
	 * find the registered handler — the click listener would leak and keep
	 * spawning provisional points after the tool is deselected.
	 */
	private readonly boundHandleClick: (
		this: HTMLCanvasElement,
		ev: HTMLElementEventMap["click"]
	) => void;
	private readonly selectedListenerBundles: ListenerBundle[];

	constructor(
		annotationManager: AnnotationManager,
		undoManager: UndoManager,
		scene: Scene<M>,
		selectionBuffer: SelectionBuffer,
		dbLinkManager: DbLinkManager
	) {
		super(NAME, annotationManager, undoManager, scene, selectionBuffer);
		this.dbLinkManager = dbLinkManager;
		this.boundHandleClick = this.handleClick.bind(this) as (
			this: HTMLCanvasElement,
			ev: HTMLElementEventMap["click"]
		) => void;
		this.selectedListenerBundles = [
			{
				configs: [
					{
						name: "click",
						listener: this.boundHandleClick,
					},
				],
			},
		];
	}

	protected override onLoad(): void {
		// nothing to do
	}

	protected override onSelected(): void {
		// nothing to do
	}

	protected override onUpdate(): void {
		// nothing to do — interactions are handled via dedicated listeners
	}

	protected override onUnselected(): void {
		// Drop any pending point and clear selection so switching tools
		// doesn't leave a half-open linking flow or a still-selected marker
		// the user can no longer act on.
		this.dbLinkManager.cancelPending();
		this.dbLinkManager.select(null);
	}

	protected override onDestroy(): void {
		// nothing to do
	}

	protected override onCameraChange(): void {
		// nothing to do
	}

	protected override getOnSelectedListenerBundles(): ListenerBundle[] {
		return [
			...super.getOnSelectedListenerBundles(),
			...this.selectedListenerBundles,
		];
	}

	public override getToolButtonComponent(): FC<ToolButtonProps> {
		return DbLinkToolButton;
	}

	public override getQuickSettingsComponent(): FC<ToolQuickSettingsProps> {
		// No quick settings for v1.
		return () => null;
	}

	private handleClick(event: MouseEvent): void {
		// If a point is currently selected, an empty-model click should just
		// deselect — not create a new provisional point. This prevents the
		// "click to dismiss the trash UI" gesture from spawning an unwanted
		// new point.
		if (this.dbLinkManager.getSelectedId() !== null) {
			this.dbLinkManager.select(null);
			return;
		}

		// Already a pending point waiting → ignore (linking window is open).
		if (this.dbLinkManager.getPendingPoint() !== null) {
			return;
		}

		const canvas = event.currentTarget as HTMLCanvasElement;
		const rect = canvas.getBoundingClientRect();
		this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		this.raycaster.setFromCamera(this.ndc, this.scene.camera);
		const modelObject = this.scene.getModel().getObject();
		const hits = this.raycaster.intersectObject(modelObject, true);
		if (hits.length === 0) {
			// Clicked empty space and not on the model — ignore.
			return;
		}

		const hit = hits[0]!.point;
		this.dbLinkManager.beginPending({
			id: crypto.randomUUID(),
			position: { x: hit.x, y: hit.y, z: hit.z },
			value: "",
		});
	}
}
