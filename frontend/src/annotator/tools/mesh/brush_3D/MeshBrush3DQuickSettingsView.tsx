import { SphereQuickSettingsView } from "~annotator/tools/common/elements/sphere/SphereQuickSettingsView";
import { MESH_BRUSH_3D_SETTINGS } from "./MeshBrush3D";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function MeshBrush3DQuickSettingsView() {
	return (
		<SphereQuickSettingsView sizeSetting={MESH_BRUSH_3D_SETTINGS.scale} />
	);
}
