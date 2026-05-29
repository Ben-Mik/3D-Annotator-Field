import {
	EMPTY_DB_LINK_CONFIG,
	type DbLinkConfig,
	type DbLinkPoint,
} from "./entity";
import { type Destroyable } from "~entity/Types";

const SAVE_DEBOUNCE_MS = 200;

export type SaveCallback = (points: DbLinkPoint[]) => Promise<unknown>;

/**
 * Holds the collection of DB-link points for the current model, plus the
 * transient selection state used by the UI. Persistence is handled via a
 * save callback wired up at setup time — the manager itself doesn't know
 * about the API surface.
 *
 * Mutations notify subscribers and schedule a debounced save.
 */
export class DbLinkManager implements Destroyable {
	private points: DbLinkPoint[] = [];
	private selectedId: string | null = null;
	private pendingPoint: DbLinkPoint | null = null;
	private config: DbLinkConfig = EMPTY_DB_LINK_CONFIG;

	private readonly listeners = new Set<() => void>();
	private saveCallback: SaveCallback | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	/*
	 *  WIRING
	 */

	public setSaveCallback(cb: SaveCallback | null): void {
		this.saveCallback = cb;
	}

	public setConfig(config: DbLinkConfig): void {
		this.config = config;
		this.notify();
	}

	public getConfig(): DbLinkConfig {
		return this.config;
	}

	/*
	 *  DATA OPERATIONS
	 */

	/**
	 * Replaces the entire collection without triggering a save. Used at
	 * initial load to populate from the server.
	 */
	public loadPoints(points: DbLinkPoint[]): void {
		this.points = points.map(clonePoint);
		this.selectedId = null;
		this.notify();
	}

	public addPoint(point: DbLinkPoint): void {
		this.points = [...this.points, clonePoint(point)];
		this.notify();
		this.scheduleSave();
	}

	public removePoint(id: string): void {
		const next = this.points.filter((p) => p.id !== id);
		if (next.length === this.points.length) return;
		this.points = next;
		if (this.selectedId === id) {
			this.selectedId = null;
		}
		this.notify();
		this.scheduleSave();
	}

	/**
	 * Re-inserts a previously deleted point (used by undo).
	 */
	public restorePoint(point: DbLinkPoint): void {
		if (this.points.some((p) => p.id === point.id)) return;
		this.points = [...this.points, clonePoint(point)];
		this.notify();
		this.scheduleSave();
	}

	public updatePointPosition(
		id: string,
		position: { x: number; y: number; z: number }
	): void {
		const index = this.points.findIndex((p) => p.id === id);
		if (index === -1) return;
		const next = [...this.points];
		next[index] = { ...next[index]!, position: { ...position } };
		this.points = next;
		this.notify();
		this.scheduleSave();
	}

	/*
	 *  QUERIES
	 */

	public getPoints(): readonly DbLinkPoint[] {
		return this.points;
	}

	public getPoint(id: string): DbLinkPoint | undefined {
		return this.points.find((p) => p.id === id);
	}

	public getSelectedId(): string | null {
		return this.selectedId;
	}

	public select(id: string | null): void {
		if (this.selectedId === id) return;
		// Don't allow selecting an id that isn't in the collection.
		if (id !== null && !this.points.some((p) => p.id === id)) {
			return;
		}
		this.selectedId = id;
		this.notify();
	}

	/*
	 *  PENDING POINT (provisional, awaiting Add/New link/Cancel)
	 */

	public getPendingPoint(): DbLinkPoint | null {
		return this.pendingPoint;
	}

	public beginPending(point: DbLinkPoint): void {
		this.pendingPoint = clonePoint(point);
		this.notify();
	}

	/**
	 * Commits the pending point to the collection with the user-provided
	 * value, then clears it. Triggers a save.
	 */
	public commitPending(value: string): DbLinkPoint | null {
		if (!this.pendingPoint) return null;
		const committed: DbLinkPoint = {
			...this.pendingPoint,
			value,
		};
		this.pendingPoint = null;
		this.points = [...this.points, clonePoint(committed)];
		this.notify();
		this.scheduleSave();
		return committed;
	}

	public cancelPending(): void {
		if (!this.pendingPoint) return;
		this.pendingPoint = null;
		this.notify();
	}

	/*
	 *  SUBSCRIPTIONS
	 */

	public subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	/*
	 *  PERSISTENCE (DEBOUNCED)
	 */

	private scheduleSave(): void {
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.flushSave();
		}, SAVE_DEBOUNCE_MS);
	}

	private flushSave(): void {
		if (!this.saveCallback) return;
		const snapshot = this.points.map(clonePoint);
		void this.saveCallback(snapshot);
	}

	/**
	 * Flush any pending debounced save immediately.
	 */
	public flush(): void {
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			this.flushSave();
		}
	}

	/*
	 *  LIFECYCLE
	 */

	public destroy(): void {
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.listeners.clear();
		this.saveCallback = null;
	}
}

function clonePoint(point: DbLinkPoint): DbLinkPoint {
	return {
		id: point.id,
		position: { ...point.position },
		value: point.value,
	};
}
