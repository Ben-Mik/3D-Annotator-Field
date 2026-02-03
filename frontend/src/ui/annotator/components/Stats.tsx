import { useEffect, useRef } from "react";
import { BooleanSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { useSetting } from "../hooks/Settings";

export const STATS_SETTING = new BooleanSetting("showStats", true);
const statsSettingsRegistry = new LocalStorageSettingsRegistry(
	"stats-Exc69H2F"
);
statsSettingsRegistry.register(STATS_SETTING);

export function Stats() {
	const statsRef = useRef<HTMLDivElement>(null);
	const annotator = useAnnotator();

	const [showStats] = useSetting(STATS_SETTING);

	useEffect(() => {
		if (!annotator) return;

		const statsWrapper = statsRef.current;
		const stats = annotator.sceneManager.getStatsElement();

		stats.style.top = "";
		stats.style.left = "";
		stats.style.bottom = "0px";
		stats.style.right = "0px";
		statsWrapper?.appendChild(stats);

		return () => {
			statsWrapper?.removeChild(stats);
		};
	}, [annotator, showStats]);

	return showStats ? <div ref={statsRef}></div> : null;
}
