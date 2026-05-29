import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
} from "react";
import { type DbLinkPoint } from "./entity";
import { useAPI } from "~ui/contexts/APIContext";
import { useAnnotator, useModelInformation } from "~ui/annotator/contexts/AnnotatorContext";

/**
 * Renders only when a provisional point is waiting to be bound. Lets the
 * user type a value (with autocomplete over previously-used values in this
 * project) and either bind it (Add), bind + open the DB's create-new URL
 * (New link), or discard it (Cancel).
 */
export function LinkingWindow() {
	const annotator = useAnnotator();
	const modelInformation = useModelInformation();
	const api = useAPI();

	const [pendingPoint, setPendingPoint] = useState<DbLinkPoint | null>(null);
	const [knownValues, setKnownValues] = useState<string[]>([]);
	const [inputValue, setInputValue] = useState("");
	const [highlightIndex, setHighlightIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);

	// Subscribe to manager's pending state.
	useEffect(() => {
		if (!annotator || !annotator.dbLinkManager) return;
		const manager = annotator.dbLinkManager;
		const sync = () => setPendingPoint(manager.getPendingPoint());
		sync();
		return manager.subscribe(sync);
	}, [annotator]);

	// Fetch fresh autocomplete values each time a new pending point opens.
	useEffect(() => {
		if (!pendingPoint || !modelInformation || !api.dbLinks) {
			setKnownValues([]);
			setInputValue("");
			setHighlightIndex(-1);
			return;
		}
		const dbLinkApi = api.dbLinks;
		setInputValue("");
		setHighlightIndex(-1);
		void (async () => {
			const res = await dbLinkApi.listProjectValues(
				modelInformation.projectId
			);
			if (res.isOk()) {
				setKnownValues(res.value);
			} else {
				setKnownValues([]);
			}
		})();
		// Focus the input when the window opens.
		setTimeout(() => inputRef.current?.focus(), 0);
	}, [pendingPoint, modelInformation, api]);

	const filtered = inputValue
		? knownValues.filter((v) =>
				v.toLowerCase().includes(inputValue.toLowerCase())
		  )
		: knownValues;

	const commit = useCallback(
		(value: string, openCreateNewTab: boolean) => {
			const manager = annotator?.dbLinkManager;
			if (!manager) return;
			const trimmed = value.trim();
			if (!trimmed) return;
			const committed = manager.commitPending(trimmed);
			if (!committed) return;
			if (openCreateNewTab) {
				const config = manager.getConfig();
				const template =
					config.createNewUrlTemplate || config.webclientUrl;
				if (template) {
					const url = template.includes("{value}")
						? template.replace(/\{value\}/g, encodeURIComponent(trimmed))
						: template;
					window.open(url, "_blank", "noopener,noreferrer");
				}
			}
		},
		[annotator]
	);

	const cancel = useCallback(() => {
		annotator?.dbLinkManager?.cancelPending();
	}, [annotator]);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlightIndex((i) =>
				Math.min(i + 1, filtered.length - 1)
			);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlightIndex((i) => Math.max(i - 1, -1));
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (highlightIndex >= 0 && filtered[highlightIndex]) {
				// Fill the input with the highlighted match.
				setInputValue(filtered[highlightIndex]!);
				setHighlightIndex(-1);
			} else {
				// Enter with no dropdown highlight → New link.
				commit(inputValue, true);
			}
		} else if (event.key === "Escape") {
			event.preventDefault();
			cancel();
		}
	};

	if (!pendingPoint) return null;

	return (
		<div className="modal modal-open">
			<div className="modal-box relative w-96">
				<h2 className="mb-2 text-xl">Link to DB entry</h2>
				<p className="mb-4 text-sm opacity-70">
					Enter or pick the value to bind this point to.
				</p>

				<input
					ref={inputRef}
					type="text"
					value={inputValue}
					onChange={(e) => {
						setInputValue(e.target.value);
						setHighlightIndex(-1);
					}}
					onKeyDown={onKeyDown}
					className="input input-bordered w-full"
					placeholder="Type or pick a value"
				/>

				{filtered.length > 0 && (
					<ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-base-300">
						{filtered.map((value, index) => (
							<li
								key={value}
								className={`cursor-pointer truncate px-3 py-1 text-sm hover:bg-base-200 ${
									index === highlightIndex
										? "bg-base-200"
										: ""
								}`}
								onClick={() => {
									setInputValue(value);
									setHighlightIndex(-1);
									inputRef.current?.focus();
								}}
							>
								{value}
							</li>
						))}
					</ul>
				)}

				<div className="modal-action">
					<button
						type="button"
						className="btn btn-ghost normal-case"
						onClick={cancel}
					>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-outline normal-case"
						onClick={() => commit(inputValue, false)}
						disabled={!inputValue.trim()}
					>
						Add
					</button>
					<button
						type="button"
						className="btn btn-primary normal-case"
						onClick={() => commit(inputValue, true)}
						disabled={!inputValue.trim()}
					>
						New link
					</button>
				</div>
			</div>
		</div>
	);
}
