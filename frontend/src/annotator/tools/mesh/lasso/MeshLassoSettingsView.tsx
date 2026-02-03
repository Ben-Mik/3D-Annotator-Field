import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { MESH_LASSO_SETTINGS } from "./MeshLasso";

/**
 * The button component to access the quick setting of the MeshLasso
 *
 * @param props the component props
 * @returns the settings component
 */
export function MeshLassoSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.LASSO()}
				annotationMode={LL.TRIANGLE_MESH()}
			></ToolHeading>
			<ColorSettingView
				name={LL.LASSO_COLOR()}
				description={LL.LASSO_COLOR_DESC()}
				setting={MESH_LASSO_SETTINGS.lineColor}
			></ColorSettingView>
		</>
	);
}
