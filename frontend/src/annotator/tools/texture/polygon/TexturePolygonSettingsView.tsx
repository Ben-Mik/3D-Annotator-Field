import { useI18nContext } from "i18n/i18n-react";
import { ColorSettingView } from "~ui/annotator/components/settings/ColorSettingView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { TEXTURE_POLYGON_SETTINGS } from "./TexturePolygon";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function TexturePolygonSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.POLYGON()}
				annotationMode={LL.TRIANGLE_MESH_TEXTURE()}
			></ToolHeading>
			<ColorSettingView
				name={LL.POLYGON_COLOR()}
				description={LL.POLYGON_COLOR_DESC()}
				setting={TEXTURE_POLYGON_SETTINGS.lineColor}
			></ColorSettingView>
		</>
	);
}
