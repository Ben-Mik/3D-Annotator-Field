import { useI18nContext } from "i18n/i18n-react";
import { Save } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import {
	useAnnotator,
	useModelInformation,
} from "~ui/annotator/contexts/AnnotatorContext";
import { ToolButton } from "~ui/components/ToolButton";
import { useAPI } from "~ui/contexts/APIContext";

export function SaveButton() {
	const { LL } = useI18nContext();
	const api = useAPI();
	const annotator = useAnnotator();
	const modelInformation = useModelInformation();
	const isInFlightRef = useRef(false);
	const pendingRef = useRef(false);

	async function backgroundSave() {
		if (!annotator || !modelInformation) return;
		if (isInFlightRef.current) {
			pendingRef.current = true;
			return;
		}
		isInFlightRef.current = true;
		pendingRef.current = false;
		await annotator.save();
		const dataStream =
			await annotator.annotationFileManager.readAnnotationFile();
		await api.files.uploadAnnotationFile(modelInformation.id, dataStream, {
			onCompressionProgress: () => {},
			onUploadProgress: () => {},
		});
		isInFlightRef.current = false;
		if (pendingRef.current) backgroundSave();
	}

	useEffect(() => {
		if (!annotator) return;
		return annotator.undoManager.on("countChange", ({ undos }) => {
			if (undos > 0) backgroundSave();
		});
	}, [annotator]);

	async function onSaveHandler() {
		if (!annotator || !modelInformation) return;

		const id = toast.info(LL.SAVING(), {
			isLoading: true,
		});

		isInFlightRef.current = true;
		pendingRef.current = false;
		await annotator.save();

		const dataStream =
			await annotator.annotationFileManager.readAnnotationFile();
		const res = await api.files.uploadAnnotationFile(
			modelInformation.id,
			dataStream,
			{
				onCompressionProgress: (n) => {
					console.log(
						`Compressing annotation file: ${n.toFixed(0)}%`
					);
				},
				onUploadProgress: (n) => {
					console.log(`Upload annotation file: ${n.toFixed(0)}%`);
				},
			}
		);

		isInFlightRef.current = false;

		if (res.isErr()) {
			toast.update(id, {
				isLoading: false,
				render: LL.UPLOAD_ERROR(),
				type: "error",
			});
			return;
		}

		toast.update(id, {
			isLoading: false,
			render: LL.SAVING_SUCCESS(),
			type: "success",
			autoClose: 3000,
		});
	}

	return (
		<ToolButton
			icon={<Save size={48} strokeWidth={1} />}
			toolAlt={LL.SAVE()}
			toolFunc={onSaveHandler}
			key={2}
			selected={false}
		/>
	);
}
