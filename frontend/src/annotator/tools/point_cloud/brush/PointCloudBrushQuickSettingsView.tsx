import { CircleQuickSettingsView } from "~annotator/tools/common/elements/circle/CircleQuickSettingsView";
import { POINT_CLOUD_BRUSH_SETTINGS } from "./PointCloudBrush";

/**
 * The button component to access the quick setting oft the PointBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function PointCloudBrushQuickSettingsView() {
	return (
		<CircleQuickSettingsView
			sizeSetting={POINT_CLOUD_BRUSH_SETTINGS.scale}
		/>
	);
}
