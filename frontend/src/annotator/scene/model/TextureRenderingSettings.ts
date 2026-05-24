import { BooleanSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";

export const TEXTURE_RENDERING_SETTINGS = {
	mipmapsEnabled: new BooleanSetting("mipmapsEnabled", true),
};

const settingsRegistry = new LocalStorageSettingsRegistry(
	"textureRendering-pV4qN"
);
settingsRegistry.registerMultiple(TEXTURE_RENDERING_SETTINGS);
