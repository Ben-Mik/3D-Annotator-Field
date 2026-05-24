import { Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * Toggle button that locks/unlocks the camera controls.
 *
 * When LOCKED, single-finger touches / single clicks go to the active
 * annotation tool instead of orbiting the camera. Useful on tablets,
 * where there's no shift/cmd modifier to differentiate.
 *
 * When UNLOCKED (default), camera controls behave normally.
 */
export function ViewLockButton() {
	const annotator = useAnnotator();
	const [locked, setLocked] = useState(false);

	function toggle() {
		if (!annotator) return;
		const next = !locked;
		annotator.setViewLocked(next);
		setLocked(next);
	}

	return (
		<ToolButton
			icon={
				locked ? (
					<Lock size={48} strokeWidth={1} />
				) : (
					<Unlock size={48} strokeWidth={1} />
				)
			}
			toolAlt={locked ? "Unlock view" : "Lock view (touch annotates)"}
			toolFunc={toggle}
			selected={locked}
		/>
	);
}
