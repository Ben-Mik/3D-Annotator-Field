import { useEffect, useState } from "react";
import { type Project } from "~entity/Project";
import { useAPI } from "~ui/contexts/APIContext";
import { DbLinkSettingsModal } from "./DbLinkSettingsModal";
import { type DbLinkConfig, EMPTY_DB_LINK_CONFIG } from "./entity";

interface Props {
	project: Project;
	isOwner: boolean;
}

/**
 * Self-contained owner-only DB-link section for the project overview page.
 * Owns its own config fetch + "Configured/Not configured" status + the
 * Edit DB-link button. ProjectPage just mounts this conditionally.
 */
export function DbLinkProjectSection({ project, isOwner }: Props) {
	const api = useAPI();
	const [config, setConfig] = useState<DbLinkConfig>(EMPTY_DB_LINK_CONFIG);
	const [, setVersion] = useState(0);

	useEffect(() => {
		if (!isOwner || !api.dbLinks) return;
		const abort = new AbortController();
		const dbLinkApi = api.dbLinks;
		void dbLinkApi
			.getConfig(project.id, abort)
			// `api.dbLinks` is typed as `any` at the API boundary, so the
			// inferred return type erases. Cast back to the real client.
			.then((res: { isOk: () => boolean; value: DbLinkConfig }) => {
				if (res.isOk()) setConfig(res.value);
			});
		return () => abort.abort();
	}, [api, project.id, isOwner]);

	if (!isOwner || !api.dbLinks) return null;

	const isConfigured =
		config.webclientUrl ||
		config.lookupUrlTemplate ||
		config.createNewUrlTemplate;

	return (
		<>
			<h2 className="text-xl">DB-link</h2>
			<p className="my-2 text-sm opacity-70">
				{isConfigured ? "Configured" : "Not configured"}
			</p>
			<div className="my-4">
				<DbLinkSettingsModal
					project={project}
					currentConfig={config}
					onSaved={(updated) => {
						setConfig(updated);
						setVersion((v) => v + 1);
					}}
				/>
			</div>
		</>
	);
}
