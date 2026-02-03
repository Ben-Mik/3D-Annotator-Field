import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { MESH_POLYGON_SETTINGS } from "./MeshPolygon";

/**
 * The button component to access the quick setting of the MeshPolygon
 *
 * @param props the component props
 * @returns the settings component
 */
export function MeshPolygonSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.POLYGON()}
				annotationMode={LL.TRIANGLE_MESH()}
			></ToolHeading>
			<ColorSettingView
				name={LL.POLYGON_COLOR()}
				description={LL.POLYGON_COLOR_DESC()}
				setting={MESH_POLYGON_SETTINGS.lineColor}
			></ColorSettingView>
		</>
	);
}
