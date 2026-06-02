import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolButton } from "~ui/components/ToolButton";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";

/**
 * Header button visible only while the DB-link tool is selected. Deletes
 * the currently selected DB-link point. No-op when no point is selected.
 * Mounting/unmounting is handled by HeaderSettings based on the active tool.
 */
export function DbLinkDeleteButton() {
	const annotator = useAnnotator();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedValue, setSelectedValue] = useState<string>("");

	useEffect(() => {
		if (!annotator || !annotator.dbLinkManager) return;
		const manager = annotator.dbLinkManager;
		const sync = () => {
			const id = manager.getSelectedId();
			setSelectedId(id);
			setSelectedValue(id ? manager.getPoint(id)?.value ?? "" : "");
		};
		sync();
		return manager.subscribe(sync);
	}, [annotator]);

	// Delete / Backspace removes the selected point; Escape deselects.
	useEffect(() => {
		if (!annotator || !annotator.dbLinkManager) return;
		const manager = annotator.dbLinkManager;
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				const id = manager.getSelectedId();
				if (id) {
					event.preventDefault();
					manager.removePoint(id);
				}
			} else if (event.key === "Escape") {
				if (manager.getSelectedId()) {
					event.preventDefault();
					manager.select(null);
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [annotator]);

	function onClick() {
		const manager = annotator?.dbLinkManager;
		if (!manager || !selectedId) return;
		manager.removePoint(selectedId);
	}

	return (
		<ToolButton
			icon={<Trash2 size={48} strokeWidth={1} />}
			toolAlt={selectedId ? `Delete "${selectedValue}"` : undefined}
			toolFunc={onClick}
		/>
	);
}
