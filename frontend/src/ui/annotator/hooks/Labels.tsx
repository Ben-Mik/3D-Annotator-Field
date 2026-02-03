import { useEffect, useState } from "react";
import type { Label } from "~entity/Annotation";
import { useAnnotator } from "../contexts/AnnotatorContext";

export function useLabels() {
	const annotator = useAnnotator();

	const [labels, setLabels] = useState<readonly Label[]>([]);
	const [currentLabel, setCurrentLabel] = useState<Label | null>(null);
	const [isEraserSelected, setIsEraserSelected] = useState(false);

	useEffect(() => {
		if (!annotator) return;

		const labelManager = annotator.labelManager;

		const unsubscribeActiveLabel = labelManager.on(
			"activeLabelChange",
			(label) => {
				if (label.isNeutral) {
					setIsEraserSelected(true);
				} else {
					if (!label.annotationVisible) {
						labelManager.toggleVisibility(label);
						setLabels(labelManager.getLabels());
					}

					setIsEraserSelected(false);
					setCurrentLabel(label);
				}
			}
		);

		const unsubscribeLock = labelManager.on("lockChange", () => {
			setLabels(labelManager.getLabels());
		});

		const unsubscribeVisibility = labelManager.on(
			"visibilityChange",
			() => {
				console.log("hi");
				annotator.notifyVisualizerChange();
				setLabels(labelManager.getLabels());
			}
		);

		setLabels(labelManager.getLabels());
		setCurrentLabel(labelManager.getActiveLabel());

		return () => {
			unsubscribeActiveLabel();
			unsubscribeLock();
			unsubscribeVisibility();
		};
	}, [annotator]);

	function selectLabel(label: Label) {
		if (!annotator) return;
		annotator.labelManager.selectLabel(label);
	}

	function toggleEraser() {
		if (!annotator) return;
		if (isEraserSelected && currentLabel) {
			annotator.labelManager.selectLabel(currentLabel);
		} else {
			annotator.labelManager.selectEraser();
		}
	}

	function toggleLock(label: Label) {
		if (!annotator) return;
		annotator.labelManager.toggleLock(label);
	}

	function toggleVisibility(label: Label) {
		if (!annotator) return;
		annotator.labelManager.toggleVisibility(label);
	}

	return {
		labels,
		currentLabel,
		isEraserSelected,
		selectLabel,
		toggleEraser,
		toggleLock,
		toggleVisibility,
	};
}
