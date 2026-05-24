import { type Vector2 } from "three";
import { type ListenerBundle, type ListenerConfig } from "./Listener";

/**
 * Represents the pointer
 */
export interface Pointer {
	hasChanged: boolean;
	hasMoved: boolean;
	position: Vector2;
	buttons: MouseButtons;
}

/**
 * The different mouse inputs
 */
export enum MouseButtons {
	NONE = 0,
	PRIMARY = 1,
	SECONDARY = 2,
	AUXILIARY = 4,
	FOURTH = 8,
	FIFTH = 16,
}

/**
 * A bundle of pointer Listeners
 */
export class PointerListenerBundle<T extends Pointer>
	implements ListenerBundle
{
	private readonly pointer: T;

	/**
	 * A PointerMoveListener
	 */
	private readonly pointerMove: ListenerConfig<"pointermove"> = {
		name: "pointermove",
		listener: this.pointerMoveListener.bind(this),
	};

	/**
	 * A PointerMoveListener
	 */
	private readonly pointerDown: ListenerConfig<"pointerdown"> = {
		name: "pointerdown",
		listener: this.pointerDownListener.bind(this),
	};

	/**
	 * A PointerUpListener
	 */
	private readonly pointerUp: ListenerConfig<"pointerup"> = {
		name: "pointerup",
		listener: this.pointerUpListener.bind(this),
	};

	public configs = [this.pointerMove, this.pointerDown, this.pointerUp];

	/**
	 * Constructs a new PointerListenerBundle
	 *
	 * @param pointer the pointer
	 */
	constructor(pointer: T) {
		this.pointer = pointer;
	}

	public resetState(): void {
		this.pointer.hasChanged = false;
		this.pointer.hasMoved = false;
	}

	/**
	 * Defines the PointerMoveListener
	 *
	 * @param event the pointer event
	 */
	private pointerMoveListener(event: PointerEvent) {
		this.pointer.hasChanged = true;
		this.pointer.hasMoved = true;
		// Normalize to Three.js NDC (-1..1) using the canvas's bounding rect,
		// not the window. Using window dimensions would offset the result by
		// the header/sidebar pixels, which on tablets shows up as the brush
		// landing slightly below the actual pencil/finger touch point.
		const canvas = event.currentTarget as HTMLElement;
		const rect = canvas.getBoundingClientRect();
		this.pointer.position.x =
			((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.position.y =
			-((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	/**
	 * Defines the PointerDownListener
	 *
	 * @param event the pointer event
	 */
	private pointerDownListener(event: PointerEvent) {
		this.pointer.hasChanged = true;
		this.pointer.buttons = event.buttons;
	}

	/**
	 * Defines the PointerUpListener
	 *
	 * @param event the pointer event
	 */
	private pointerUpListener() {
		this.pointer.hasChanged = true;
		this.pointer.buttons = MouseButtons.NONE;
	}
}
