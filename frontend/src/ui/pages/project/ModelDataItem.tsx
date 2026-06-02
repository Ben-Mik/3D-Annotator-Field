import { useI18nContext } from "i18n/i18n-react";
import {
	Database,
	FileBox,
	LockKeyhole,
	LockKeyholeOpen,
	UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Errors } from "~api/Errors";
import { ModelType, type ModelInformation } from "~entity/ModelInformation";
import { type FullProject } from "~entity/Project";
import { useAPI } from "~ui/contexts/APIContext";
import { useAuth } from "~ui/contexts/AuthContext";
import { UpdateModelDataModal } from "~ui/pages/project/modals/UpdateModelDataModal";
import { useProjectPageStore } from "~ui/pages/project/ProjectPage";
import {
	humanReadableDataSize,
	writeToLocalFileSystem,
} from "~util/fileSystem/FileUtils";
import { assertUnreachable } from "~util/TypeScript";
import { StandardContainer } from "../../components/StandardContainer";

interface ModelDataItemProps {
	model: ModelInformation;
	project: FullProject;
}

export function ModelDataItem({ model, project }: ModelDataItemProps) {
	const { LL } = useI18nContext();
	const navigate = useNavigate();

	const api = useAPI();
	const user = useAuth();
	const setLoading = useProjectPageStore((state) => state.setLoading);

	async function deleteModel(id: number) {
		await api.models.delete(id);
		setLoading(true);
	}

	function unlockModelData(id: number) {
		api.models.lock(id, false);
		setLoading(true);
	}

	async function exportAnnotationFile(id: number) {
		const res = await api.files.downloadAnnotationFile(id);

		if (res.isErr()) {
			return Promise.resolve(res.error.code);
		}
		const { data } = res.value;
		await writeToLocalFileSystem(new Blob([data]));
		return Promise.resolve(undefined);
	}

	let modelTypeString;
	switch (model.modelType) {
		case ModelType.MESH:
			modelTypeString = LL.TRIANGLE_MESH();
			break;
		case ModelType.TEXTURE_MESH:
			modelTypeString = LL.TRIANGLE_MESH_TEXTURE();
			break;
		case ModelType.POINT_CLOUD:
			modelTypeString = LL.POINT_CLOUD();
			break;
		default:
			assertUnreachable(model.modelType);
	}

	return (
		<StandardContainer>
			<div className="my-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
				<div className="min-w-0 grow">
					<h2 className="text-xl">{model.name}</h2>
					<div className="mt-2 flex flex-wrap gap-2">
						<div className="badge badge-outline">
							<UserRound size={14} className="mr-1" />{" "}
							{model.owner.username}
						</div>
						<div className="badge badge-outline">
							<FileBox size={14} className="mr-1" />
							{modelTypeString}
						</div>
						<div className="badge badge-outline">
							<Database size={14} className="mr-1" />
							{humanReadableDataSize(
								model.modelFile?.size ?? 0,
								10,
								0
							)}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<UpdateModelDataModal id={model.id} name={model.name} />

					<button
						className={`btn btn-primary normal-case`}
						onClick={async () => {
							const res = await exportAnnotationFile(model.id);
							if (!res) {
								toast.success(LL.DOWNLOAD_SUCCESS());
							}

							if (res === Errors.NO_ANNOTATION_FILE) {
								toast.warning(LL.NO_ANNOTATION_FILE());
							}
						}}
					>
						{LL.EXPORT()}
					</button>
					<button
						className="btn btn-error normal-case"
						onClick={() => {
							deleteModel(model.id);
						}}
					>
						{LL.DELETE()}
					</button>

					{/*
					 * Model is locked and user is the project owner
					 */}
					{model.locked &&
						model.locked.id !== user!.id &&
						user?.id === project.owner.id && (
							<div
								className="tooltip"
								data-tip={`Gesperrt von: ` + model.locked.username}
							>
								<button
									className="btn btn-info normal-case"
									onClick={() => {
										unlockModelData(model.id);
									}}
								>
									<div className="-ml-1 mr-1 h-6 w-6">
										<LockKeyholeOpen
											strokeWidth={1.25}
											size={24}
										/>
									</div>
									{LL.UNLOCK()}
								</button>
							</div>
						)}

					{/*
					 * Model is locked, but user is not the project owner
					 */}
					{model.locked &&
						model.locked.id !== user!.id &&
						user?.id !== project.owner.id && (
							<div
								className="tooltip"
								data-tip={`Gesperrt von: ` + model.locked.username}
							>
								<button className="btn btn-disabled" disabled>
									<div className="p h-6 w-6 text-base-content">
										<LockKeyhole strokeWidth={1.25} size={24} />
									</div>
								</button>
							</div>
						)}

					{/*
					 * Model is not locked
					 */}
					{!(model.locked && model.locked.id !== user!.id) && (
						<button
							className="btn btn-accent normal-case"
							onClick={() => {
								if (project.labels.length === 0) {
									toast.warning(LL.NO_LABELS_FOUND());
									return;
								}
								navigate(`/annotate/${model.id}`);
							}}
						>
							{LL.OPEN()}
						</button>
					)}
				</div>
			</div>
		</StandardContainer>
	);
}
