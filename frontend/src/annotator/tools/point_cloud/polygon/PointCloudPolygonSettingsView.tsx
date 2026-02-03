import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { POINT_CLOUD_POLYGON_SETTINGS } from "./PointCloudPolygon";

/**
 * The button component to access the quick setting of the PointCloudPolygon
 *
 * @param props the component props
 * @returns the settings component
 */
export function PointCloudPolygonSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.POLYGON()}
				annotationMode={LL.POINT_CLOUD()}
			></ToolHeading>
			<ColorSettingView
				name={LL.POLYGON_COLOR()}
				description={LL.POLYGON_COLOR_DESC()}
				setting={POINT_CLOUD_POLYGON_SETTINGS.lineColor}
			></ColorSettingView>
		</>
	);
}
