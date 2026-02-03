import { useI18nContext } from "i18n/i18n-react";
import { CircleSettingsView } from "~annotator/tools/common/elements/circle/CircleSettingsView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { POINT_CLOUD_BRUSH_SETTINGS } from "./PointCloudBrush";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function PointCloudBrushSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.BRUSH()}
				annotationMode={LL.POINT_CLOUD()}
			></ToolHeading>
			<CircleSettingsView
				circleSettings={POINT_CLOUD_BRUSH_SETTINGS.circle}
			></CircleSettingsView>
		</>
	);
}
