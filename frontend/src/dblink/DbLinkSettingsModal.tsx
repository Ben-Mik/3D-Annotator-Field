import { useRef, useState, type FormEvent } from "react";
import { type Project } from "~entity/Project";
import { useAPI } from "~ui/contexts/APIContext";
import { type DbLinkConfig } from "./entity";

interface DbLinkSettingsModalProps {
	project: Project;
	currentConfig: DbLinkConfig;
	onSaved?: (config: DbLinkConfig) => void;
}

export function DbLinkSettingsModal({
	project,
	currentConfig,
	onSaved,
}: DbLinkSettingsModalProps) {
	const api = useAPI();

	const webclientUrlRef = useRef<HTMLInputElement>(null);
	const lookupTemplateRef = useRef<HTMLInputElement>(null);
	const createNewTemplateRef = useRef<HTMLInputElement>(null);
	const [modalOpen, setModalOpen] = useState(false);

	function submit(submitEvent: FormEvent) {
		submitEvent.preventDefault();
		if (!api.dbLinks) return;
		const next: DbLinkConfig = {
			webclientUrl: webclientUrlRef.current?.value ?? "",
			lookupUrlTemplate: lookupTemplateRef.current?.value ?? "",
			createNewUrlTemplate:
				createNewTemplateRef.current?.value ?? "",
		};
		api.dbLinks.updateConfig(project.id, next).match(
			(saved: DbLinkConfig) => {
				setModalOpen(false);
				if (onSaved) onSaved(saved);
			},
			() => {
				// Surface errors quietly for now; modal stays open.
			}
		);
	}

	return (
		<>
			<label
				htmlFor="db-link-settings-modal"
				className="modal-button btn btn-outline w-full normal-case"
				onClick={() => {
					setModalOpen(true);
				}}
			>
				Edit DB-link
			</label>
			<input
				type="checkbox"
				id="db-link-settings-modal"
				className="modal-toggle"
				checked={modalOpen}
				onChange={() => {
					setModalOpen(modalOpen);
				}}
			/>

			<div className="modal">
				<div className="modal-box relative">
					<label
						htmlFor="db-link-settings-modal"
						className="btn btn-circle btn-sm absolute right-4 top-4"
						onClick={() => {
							setModalOpen(false);
						}}
					>
						✕
					</label>
					<div className="my-auto space-y-4">
						<h2 className="text-xl">DB-link settings</h2>
						<p className="text-sm opacity-70">
							Optional URL templates used by the DB-link tool.
							Leave any field blank to disable that part of the
							feature. Use <code>{"{value}"}</code> as the
							placeholder for the bound identifier.
						</p>
					</div>
					<form onSubmit={submit}>
						<label htmlFor="webclient-url" className="label">
							<span className="label-text">Webclient URL</span>
						</label>
						<input
							type="text"
							id="webclient-url"
							placeholder="https://example.com/"
							className="input input-bordered w-full"
							maxLength={2048}
							ref={webclientUrlRef}
							defaultValue={currentConfig.webclientUrl}
						/>
						<label htmlFor="lookup-template" className="label">
							<span className="label-text">
								Lookup URL template
							</span>
						</label>
						<input
							type="text"
							id="lookup-template"
							placeholder="https://example.com/record/{value}"
							className="input input-bordered w-full"
							maxLength={2048}
							ref={lookupTemplateRef}
							defaultValue={currentConfig.lookupUrlTemplate}
						/>
						<label htmlFor="create-new-template" className="label">
							<span className="label-text">
								Create-new URL template
							</span>
						</label>
						<input
							type="text"
							id="create-new-template"
							placeholder="https://example.com/new?id={value}"
							className="input input-bordered w-full"
							maxLength={2048}
							ref={createNewTemplateRef}
							defaultValue={currentConfig.createNewUrlTemplate}
						/>
						<button
							type="submit"
							className="btn btn-outline btn-block mt-6 normal-case"
						>
							Save
						</button>
					</form>
				</div>
			</div>
		</>
	);
}
