import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { Raycaster, Vector2, Vector3 } from "three";
import { DbLinkTool } from "./DbLinkTool";
import { type DbLinkPoint } from "./entity";
import { useTools } from "~ui/annotator/hooks/Tools";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";

const OCCLUSION_EPSILON = 0.01;
const MAX_LABEL_WIDTH = "8rem";
const DRAG_THRESHOLD_PX = 3;

interface ProjectedMarker {
	id: string;
	value: string;
	screenX: number;
	screenY: number;
	hidden: boolean;
}

interface DragState {
	pointerId: number;
	pointId: string;
	startClientX: number;
	startClientY: number;
	moved: boolean;
}

export function DbLinkMarkers() {
	const annotator = useAnnotator();
	const { selectedTool } = useTools();
	const [projections, setProjections] = useState<ProjectedMarker[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const dragStateRef = useRef<DragState | null>(null);
	const dragRaycaster = useRef(new Raycaster()).current;
	const dragNdc = useRef(new Vector2()).current;

	const isDbLinkToolActive = selectedTool instanceof DbLinkTool;
	const noToolActive = !selectedTool;
	const interactive = isDbLinkToolActive || noToolActive;

	useEffect(() => {
		if (!annotator || !annotator.dbLinkManager) return;

		const manager = annotator.dbLinkManager;
		const scene = annotator.getScene();

		const raycaster = new Raycaster();
		const pointWorld = new Vector3();
		const directionVec = new Vector3();

		let currentPoints: readonly DbLinkPoint[] = manager.getPoints();

		function syncFromManager() {
			currentPoints = manager.getPoints();
			setSelectedId(manager.getSelectedId());
		}

		function recompute() {
			if (currentPoints.length === 0) {
				setProjections((prev) => (prev.length === 0 ? prev : []));
				return;
			}

			const camera = scene.camera;
			const modelObject = scene.getModel().getObject();
			const canvas = scene.renderer.domElement;
			const rect = canvas.getBoundingClientRect();
			const width = rect.width;
			const height = rect.height;

			const cameraPos = camera.position;

			const computed: Array<ProjectedMarker & { distance: number }> = [];

			for (const point of currentPoints) {
				pointWorld.set(
					point.position.x,
					point.position.y,
					point.position.z
				);

				const projected = pointWorld.clone().project(camera);
				const screenX = ((projected.x + 1) / 2) * width;
				const screenY = ((1 - projected.y) / 2) * height;

				const inFrustum =
					projected.z > -1 &&
					projected.z < 1 &&
					projected.x >= -1 &&
					projected.x <= 1 &&
					projected.y >= -1 &&
					projected.y <= 1;

				let occluded = false;
				if (inFrustum) {
					directionVec
						.copy(pointWorld)
						.sub(cameraPos)
						.normalize();
					raycaster.set(cameraPos, directionVec);
					const distance = cameraPos.distanceTo(pointWorld);
					raycaster.far = distance + OCCLUSION_EPSILON;
					raycaster.near = 0;
					const hits = raycaster.intersectObject(
						modelObject,
						true
					);
					if (
						hits.length > 0 &&
						hits[0]!.distance < distance - OCCLUSION_EPSILON
					) {
						occluded = true;
					}
				}

				computed.push({
					id: point.id,
					value: point.value,
					screenX,
					screenY,
					hidden: !inFrustum || occluded,
					distance: cameraPos.distanceTo(pointWorld),
				});
			}

			computed.sort((a, b) => b.distance - a.distance);

			setProjections(
				computed.map(({ id, value, screenX, screenY, hidden }) => ({
					id,
					value,
					screenX,
					screenY,
					hidden,
				}))
			);
		}

		syncFromManager();
		recompute();

		const unsubData = manager.subscribe(() => {
			syncFromManager();
			recompute();
		});

		const unsubFrame = scene.on("beforeRender", recompute);

		return () => {
			unsubData();
			unsubFrame();
		};
	}, [annotator]);

	const handleMarkerClick = useCallback(
		(point: DbLinkPoint, event: ReactMouseEvent<HTMLDivElement>) => {
			const manager = annotator?.dbLinkManager;
			if (!manager) return;
			// If a drag occurred, suppress the click.
			if (dragStateRef.current?.moved) {
				return;
			}
			event.stopPropagation();
			if (isDbLinkToolActive) {
				manager.select(point.id);
			} else if (noToolActive) {
				const config = manager.getConfig();
				const template = config.lookupUrlTemplate;
				if (template && point.value) {
					const url = template.includes("{value}")
						? template.replace(
								/\{value\}/g,
								encodeURIComponent(point.value)
						  )
						: template;
					window.open(url, "_blank", "noopener,noreferrer");
				}
			}
		},
		[annotator, isDbLinkToolActive, noToolActive]
	);

	const handlePointerDown = useCallback(
		(point: DbLinkPoint, event: ReactPointerEvent<HTMLDivElement>) => {
			const manager = annotator?.dbLinkManager;
			if (!manager) return;
			if (!isDbLinkToolActive) return;
			if (manager.getSelectedId() !== point.id) {
				// Marker must already be selected before drag is allowed.
				return;
			}
			(event.target as Element).setPointerCapture(event.pointerId);
			dragStateRef.current = {
				pointerId: event.pointerId,
				pointId: point.id,
				startClientX: event.clientX,
				startClientY: event.clientY,
				moved: false,
			};
		},
		[annotator, isDbLinkToolActive]
	);

	const handlePointerMove = useCallback(
		(point: DbLinkPoint, event: ReactPointerEvent<HTMLDivElement>) => {
			const drag = dragStateRef.current;
			if (!drag || drag.pointId !== point.id || !annotator) return;

			const dx = event.clientX - drag.startClientX;
			const dy = event.clientY - drag.startClientY;
			if (
				!drag.moved &&
				Math.hypot(dx, dy) < DRAG_THRESHOLD_PX
			) {
				return;
			}
			drag.moved = true;

			const scene = annotator.getScene();
			const canvas = scene.renderer.domElement;
			const rect = canvas.getBoundingClientRect();
			dragNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			dragNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

			dragRaycaster.setFromCamera(dragNdc, scene.camera);
			const hits = dragRaycaster.intersectObject(
				scene.getModel().getObject(),
				true
			);
			if (hits.length === 0) {
				// Off the model — keep last valid position.
				return;
			}
			const hit = hits[0]!.point;
			annotator.dbLinkManager!.updatePointPosition(point.id, {
				x: hit.x,
				y: hit.y,
				z: hit.z,
			});
		},
		[annotator, dragRaycaster, dragNdc]
	);

	const handlePointerUp = useCallback(
		(point: DbLinkPoint, event: ReactPointerEvent<HTMLDivElement>) => {
			const drag = dragStateRef.current;
			if (!drag || drag.pointId !== point.id) return;
			(event.target as Element).releasePointerCapture(event.pointerId);
			// Keep `moved` set for the upcoming click event so the click
			// handler can suppress itself, then clear shortly after.
			const wasMoved = drag.moved;
			setTimeout(() => {
				if (dragStateRef.current === drag) {
					dragStateRef.current = null;
				}
			}, 0);
			if (wasMoved) {
				// Position is already committed by pointermove; auto-save
				// debounce will flush.
			}
		},
		[]
	);

	if (!annotator || !annotator.dbLinkManager || projections.length === 0) {
		return null;
	}
	const manager = annotator.dbLinkManager;

	return (
		<div className="pointer-events-none absolute inset-0">
			{projections.map((marker) => {
				if (marker.hidden) return null;
				const isSelected = marker.id === selectedId;
				const point = manager.getPoint(marker.id);
				if (!point) return null;
				const cursorClass = isDbLinkToolActive
					? isSelected
						? "cursor-move"
						: "cursor-pointer"
					: noToolActive
					? "cursor-pointer"
					: "cursor-default";
				return (
					<div
						key={marker.id}
						className={`absolute truncate rounded-md bg-neutral px-2 py-1 text-base text-primary ${cursorClass} ${
							isSelected ? "ring-2 ring-primary" : ""
						} ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
						style={{
							left: `${marker.screenX}px`,
							top: `${marker.screenY}px`,
							transform: "translate(-50%, -50%)",
							maxWidth: MAX_LABEL_WIDTH,
						}}
						title={marker.value}
						onPointerDown={(e) => handlePointerDown(point, e)}
						onPointerMove={(e) => handlePointerMove(point, e)}
						onPointerUp={(e) => handlePointerUp(point, e)}
						onClick={(e) => handleMarkerClick(point, e)}
					>
						{marker.value}
					</div>
				);
			})}
		</div>
	);
}
