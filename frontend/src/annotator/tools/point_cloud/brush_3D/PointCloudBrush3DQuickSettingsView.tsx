import { NumberInput } from "~annotator/tools/common/components/NumberInput";
import { SphereQuickSettingsView } from "~annotator/tools/common/elements/sphere/SphereQuickSettingsView";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { POINT_CLOUD_BRUSH_3D_SETTINGS } from "./PointCloudBrush3D";

/**
 * The button component to access the quick setting oft the PointBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function PointCloudBrush3DQuickSettingsView() {
	const [raycastThreshold, setRaycastThreshold] = useSetting(
		POINT_CLOUD_BRUSH_3D_SETTINGS.raycastThreshold
	);

	return (
		<div className="flex">
			<SphereQuickSettingsView
				sizeSetting={POINT_CLOUD_BRUSH_3D_SETTINGS.scale}
			/>
			<NumberInput
				label="Snap Distance:"
				onChange={(n) => {
					setRaycastThreshold(n);
				}}
				value={raycastThreshold}
				min={POINT_CLOUD_BRUSH_3D_SETTINGS.raycastThreshold.min}
				max={POINT_CLOUD_BRUSH_3D_SETTINGS.raycastThreshold.max}
				step={0.001}
				tooltip={"Suchradius um den Zeiger"}
			/>
		</div>
	);
}
