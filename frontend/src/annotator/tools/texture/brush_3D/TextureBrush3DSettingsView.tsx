import { useI18nContext } from "i18n/i18n-react";
import { SphereSettingsView } from "~annotator/tools/common/elements/sphere/SphereSettingsView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { TEXTURE_BRUSH_3D_SETTINGS } from "./TextureBrush3D";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function TextureBrush3DSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.BRUSH_3D()}
				annotationMode={LL.TRIANGLE_MESH_TEXTURE()}
			></ToolHeading>
			<SphereSettingsView
				sphereSettings={TEXTURE_BRUSH_3D_SETTINGS.sphere}
			/>
		</>
	);
}
