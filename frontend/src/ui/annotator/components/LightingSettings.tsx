import { useI18nContext } from "i18n/i18n-react";
import { useState } from "react";
import { GLOBAL_LIGHTING_SETTINGS } from "~annotator/scene/lighting/global/GlobalLighting";
import { SUN_LIGHTING_SETTINGS } from "~annotator/scene/lighting/sun/SunLighting";
import { ModelType } from "~entity/ModelInformation";
import { type Perspective } from "~entity/Perspective";
import {
	useAnnotator,
	useModelInformation,
} from "~ui/annotator/contexts/AnnotatorContext";
import { StandardContainer } from "~ui/components/StandardContainer";
import { useSetting } from "../hooks/Settings";

const SUN_POSITION_EMPTY = "-";

export function LightingSettings() {
	const { LL } = useI18nContext();
	const annotator = useAnnotator();
	const modelInformation = useModelInformation();

	const [collapsed, setCollapsed] = useState(true);

	const [globalIntensity, setGlobalIntensity] = useSetting(
		GLOBAL_LIGHTING_SETTINGS.intensity
	);

	const [isSunActive, setIsSunActive] = useSetting(
		SUN_LIGHTING_SETTINGS.isActive
	);
	const [sunIntensity, setSunIntensity] = useSetting(
		SUN_LIGHTING_SETTINGS.intensity
	);
	const [followCamera, setFollowCamera] = useSetting(
		SUN_LIGHTING_SETTINGS.followCamera
	);
	const [sunPosition] = useSetting(SUN_LIGHTING_SETTINGS.sunPosition);

	return modelInformation?.modelType !== ModelType.POINT_CLOUD ? (
		<StandardContainer styling="select-none p-5 pb-2">
			<h1
				className={`-mt-2 mb-2 text-center text-xl ${
					annotator ? "hover:cursor-pointer" : ""
				}`}
				onClick={() => {
					if (!annotator) return;

					setCollapsed(!collapsed);
				}}
			>
				{LL.LIGHTING()}
			</h1>

			<div className={collapsed ? "hidden" : ""}>
				<label className="label pl-0">
					<span className="label-text">{LL.GLOBAL_BRIGHTNESS()}</span>
					<input
						type="range"
						name="global-light-intensity"
						className="range range-primary range-xs"
						step={0.1}
						min={GLOBAL_LIGHTING_SETTINGS.intensity.min}
						max={GLOBAL_LIGHTING_SETTINGS.intensity.max}
						value={globalIntensity}
						onChange={(e) => {
							setGlobalIntensity(parseFloat(e.target.value));
						}}
					/>
				</label>

				<div className="divider text-sm">{LL.SUN()}</div>

				<label className="label -mt-4 cursor-pointer pl-0">
					<span className="label-text">{LL.SUN()}</span>
					<input
						type="checkbox"
						name="Lighting-mode"
						className="toggle toggle-primary"
						checked={isSunActive}
						onChange={(e) => {
							setIsSunActive(e.target.checked);
						}}
					/>
				</label>

				<label className="label pl-0">
					<span className="label-text mr-4">{LL.BRIGHTNESS()}</span>
					<input
						type="range"
						name="sun-light-intensity"
						className="range range-primary range-xs "
						step={0.1}
						min={SUN_LIGHTING_SETTINGS.intensity.min}
						max={SUN_LIGHTING_SETTINGS.intensity.max}
						value={sunIntensity}
						onChange={(e) => {
							setSunIntensity(parseFloat(e.target.value));
						}}
						disabled={!isSunActive}
					/>
				</label>

				<label htmlFor="sunPos">
					<span className="label-text">{LL.AXIS_POSITION()}</span>
					<select
						id="sunPos"
						className="select w-full max-w-xs"
						value={
							sunPosition.perspective
								? sunPosition.perspective
								: SUN_POSITION_EMPTY
						}
						onChange={(e) => {
							SUN_LIGHTING_SETTINGS.sunPosition.setToPerspective(
								e.target.value as Perspective
							);
						}}
						disabled={!isSunActive}
					>
						<option value={"TOP"}>{LL.TOP()}</option>
						<option value={"BOTTOM"}>{LL.BOTTOM()}</option>
						<option value={"RIGHT"}>{LL.RIGHT()}</option>
						<option value={"LEFT"}>{LL.LEFT()}</option>
						<option value={"FRONT"}>{LL.FRONT()}</option>
						<option value={"BACK"}>{LL.BACK()}</option>
						{sunPosition.perspective === null && (
							<option disabled value={SUN_POSITION_EMPTY}>
								{SUN_POSITION_EMPTY}
							</option>
						)}
					</select>
				</label>

				<div className="divider text-sm">
					{LL.CAMERA_CONTROLLED_SUN()}
				</div>

				<div className="flex">
					<button
						type="button"
						className="btn btn-primary normal-case"
						name="set-sun"
						onClick={() => {
							annotator!.sceneManager
								.getSunLighting()
								.setSunToCurrenCameraPosition();
						}}
						disabled={!isSunActive}
					>
						{LL.SET_POSITION()}
					</button>

					<div className="ml-4">
						<label
							htmlFor="follow-camera"
							className="cursor-pointer"
						>
							<p className="label-text pb-1 ">
								{LL.FOLLOW_CAMERA()}
							</p>
						</label>
						<input
							type="checkbox"
							name="follow-camera"
							className="toggle toggle-primary"
							checked={followCamera}
							onChange={(e) => {
								setFollowCamera(e.target.checked);
							}}
							disabled={!isSunActive}
						/>
					</div>
				</div>
			</div>
		</StandardContainer>
	) : (
		<></>
	);
}
