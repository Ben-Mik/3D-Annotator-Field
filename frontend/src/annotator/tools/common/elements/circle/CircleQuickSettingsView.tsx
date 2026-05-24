import { useI18nContext } from "i18n/i18n-react";
import type { PercentageSetting } from "~settings/Settings";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { LogSlider } from "../../components/LogSlider";
import { PercentInput } from "../../components/PercentInput";

/**
 * An object to store general props for a sphere
 */
interface Props {
	sizeSetting: PercentageSetting;
}

const SLIDER_MIN = 0.1;

/**
 * A component to change the Sphere radius in the UI
 *
 * @param param0 an object that stores the sphere props
 * @returns the component
 */
export function CircleQuickSettingsView({ sizeSetting }: Props) {
	const { LL } = useI18nContext();
	const [size, setSize] = useSetting(sizeSetting);
	return (
		<>
			<LogSlider
				label={LL.SIZE() + ":"}
				value={size}
				onChange={setSize}
				min={SLIDER_MIN}
				max={sizeSetting.max}
			/>
			<PercentInput
				label=""
				value={size}
				onChange={setSize}
				min={sizeSetting.min}
				max={sizeSetting.max}
			/>
		</>
	);
}
