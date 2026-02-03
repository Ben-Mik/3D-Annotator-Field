import { useI18nContext } from "i18n/i18n-react";
import { useState } from "react";
import { type CameraType } from "~annotator/scene/Camera";
import { ARCBALL_CAMERA_CONTROLS_SETTINGS } from "~annotator/scene/controls/ArcballCameraControls";
import { CAMERA_CONTROLS_SETTINGS } from "~annotator/scene/controls/CameraControls";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { StandardContainer } from "~ui/components/StandardContainer";
import { useSetting } from "../hooks/Settings";

export function CameraSettings() {
	const annotator = useAnnotator();
	const { LL } = useI18nContext();

	const [collapsed, setCollapsed] = useState(true);
	const [selectedCamera, setSelectedCamera] = useSetting(
		CAMERA_CONTROLS_SETTINGS.cameraType
	);
	const [fov, setFov] = useSetting(CAMERA_CONTROLS_SETTINGS.fov);
	const [showGizmos, setShowGizmos] = useSetting(
		ARCBALL_CAMERA_CONTROLS_SETTINGS.showGizmos
	);

	return (
		<StandardContainer styling="select-none p-5 pb-2">
			<h1
				className={`-mt-2 mb-2 text-center text-xl ${
					annotator ? "hover:cursor-pointer" : ""
				}`}
				onClick={() => {
					if (!annotator) return;

					setCollapsed((currentState) => !currentState);
				}}
			>
				{LL.CAMERA()}
			</h1>
			<div className={collapsed ? "hidden" : ""}>
				<div className="mt-4 flex place-content-between">
					<div>{LL.GIZMO()}</div>
					<input
						type="checkbox"
						className="toggle"
						checked={showGizmos}
						onChange={({ target }) => {
							setShowGizmos(target.checked);
						}}
					/>
				</div>

				<select
					className="select select-bordered select-sm mt-4 w-full max-w-xs"
					value={selectedCamera}
					onChange={({ currentTarget }) => {
						setSelectedCamera(currentTarget.value as CameraType);
					}}
				>
					<option value="PerspectiveCamera">
						{LL.PERSPECTIVE()}
					</option>
					<option value="OrthographicCamera">
						{LL.ORTHOGRAPHIC()}
					</option>
				</select>

				<div className="mt-3 flex place-content-between">
					<div>
						<p>{LL.FOV()}</p>
					</div>
					<div>{fov}°</div>
				</div>
				<div className="mt-2">
					<input
						type="range"
						min={CAMERA_CONTROLS_SETTINGS.fov.min}
						max={CAMERA_CONTROLS_SETTINGS.fov.max}
						step={1}
						value={fov}
						className="range range-primary range-xs"
						disabled={selectedCamera === "OrthographicCamera"}
						onChange={({ target }) => {
							setFov(+target.value);
						}}
					/>
				</div>
			</div>
		</StandardContainer>
	);
}
