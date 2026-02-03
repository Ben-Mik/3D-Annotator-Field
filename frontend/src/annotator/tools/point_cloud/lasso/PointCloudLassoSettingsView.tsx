import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { POINT_CLOUD_LASSO_SETTINGS } from "./PointCloudLasso";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function PointCloudLassoSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.LASSO()}
				annotationMode={LL.POINT_CLOUD()}
			></ToolHeading>
			<ColorSettingView
				name={LL.LASSO_COLOR()}
				description={LL.LASSO_COLOR_DESC()}
				setting={POINT_CLOUD_LASSO_SETTINGS.lineColor}
			></ColorSettingView>
		</>
	);
}
