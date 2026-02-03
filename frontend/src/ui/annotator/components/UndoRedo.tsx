import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { ToolButton } from "~ui/components/ToolButton";

function useUndoRedoState() {
	const annotator = useAnnotator();
	const [undoRedo, setUndoRedo] = useState({
		hasUndos: false,
		hasRedos: false,
	});

	useEffect(() => {
		if (!annotator) return;
		return annotator.undoManager.on("countChange", (count) => {
			setUndoRedo({
				hasUndos: count.undos !== 0,
				hasRedos: count.redos !== 0,
			});
		});
	}, [annotator]);

	function undoHandler() {
		if (!annotator) return;
		annotator.undoManager.undo();
	}

	function redoHandler() {
		if (!annotator) return;
		annotator.undoManager.redo();
	}

	return {
		hasUndos: undoRedo.hasUndos,
		hasRedos: undoRedo.hasRedos,
		undoHandler,
		redoHandler,
	};
}

export function UndoButton() {
	const { undoHandler, hasUndos } = useUndoRedoState();
	return (
		<ToolButton
			icon={<Undo2 size={48} strokeWidth={1} />}
			toolFunc={undoHandler}
			key={-2}
			disabled={!hasUndos}
		/>
	);
}

export function RedoButton() {
	const { redoHandler, hasRedos } = useUndoRedoState();
	return (
		<ToolButton
			icon={<Redo2 size={48} strokeWidth={1} />}
			toolFunc={redoHandler}
			key={-3}
			disabled={!hasRedos}
		/>
	);
}
