import {
	getEmptyAnnotationsLUT,
	type AnnotationData,
	type AnnotationDataArray,
	type AnnotationsLUT,
	type AnnotationsMap,
	type Label,
	type LabeledAnnotationData,
} from "~entity/Annotation";
import { type Destroyable } from "~entity/Types";
import { EventManager } from "~events/EventManager";
import type { Subscribable } from "~events/Events";
import { type LabelManager } from "./LabelManager";

export interface AnnotationManagerEventData {
	annotations: AnnotationsLUT;
	data: LabeledAnnotationData;
}

export type AnnotationManagerEvents = {
	/**
	 * All annotations, before the annotation happened.
	 * The changes in `data` will be applied to `annotations`
	 * right after the event. They are **not** yet included.
	 */
	beforeAnnotation: AnnotationManagerEventData;
	/**
	 * All annotations, after the annotation happened, i.e including
	 * the changes represented by `data`.
	 */
	afterAnnotation: AnnotationManagerEventData;
};

/**
 * The AnnotationManager handles the annotation of data.
 * It informs all observers when a annotation happens.
 */
export class AnnotationManager
	implements Subscribable<AnnotationManagerEvents>, Destroyable
{
	private readonly eventManager = new EventManager<AnnotationManagerEvents>();
	public on = this.eventManager.on.bind(this.eventManager);

	private readonly labelManager: LabelManager;
	private annotations: AnnotationsLUT;

	/**
	 * Constructs a new AnnotationManager
	 *
	 * @param count the number of entities in the model that can be annotated
	 * @param labelManager the labelManager
	 */
	constructor(count: number, labelManager: LabelManager) {
		this.labelManager = labelManager;
		this.annotations = getEmptyAnnotationsLUT(count, true);
	}

	/**
	 * Annotates annotation data with the currently active label
	 *
	 * @param annotationData the annotation data
	 */
	public annotate(annotationData: AnnotationData): void {
		const currentLabel = this.labelManager.getActiveLabel();
		this.annotateWithLabel(currentLabel, annotationData);
	}

	/**
	 * Loads annotation data from existing annotated data.
	 * Does NOT emit an event.
	 *
	 * @param annotations the labeled annotation data
	 */
	public loadAnnotations(annotations: AnnotationsLUT) {
		if (annotations.length != this.annotations.length) {
			throw new Error("AnnotationsLUTs do not have the same length!");
		}
		this.annotations.set(annotations);
	}

	/**
	 * Returns a lookup table of the current annotationData
	 *
	 * @returns the annotations as a AnnotationsLUT
	 */
	public getAnnotationDataLUT(): AnnotationsLUT {
		return this.annotations;
	}

	public getLabeledAnnotationsMap(): AnnotationsMap {
		const labelMap = this.labelManager.getLabelMap();

		const annotationsMap = new Map<Label, AnnotationDataArray>();
		for (let i = 0; i < this.annotations.length; i++) {
			const annotationClass = this.annotations[i];
			const label = labelMap.get(annotationClass);
			if (label === undefined) {
				throw new Error("Unknown annotationClass found");
			}
			const indices = annotationsMap.get(label);
			if (indices === undefined) {
				annotationsMap.set(label, [i]);
			} else {
				indices.push(i);
			}
		}

		return annotationsMap;
	}

	public getLabeledAnnotations(): LabeledAnnotationData[] {
		const annotationsMap = this.getLabeledAnnotationsMap();
		const labeledAnnotations: LabeledAnnotationData[] = [];
		for (const [label, indices] of annotationsMap.entries()) {
			labeledAnnotations.push({ label: label, data: indices });
		}
		return labeledAnnotations;
	}

	public annotateWithLabel(label: Label, data: AnnotationData) {
		const labelLUT = this.labelManager.getLabelLUT();
		// TODO: Do in place
		const editableData = new Array<number>(data.length);
		let counter = 0;
		for (let i = 0; i < data.length; i++) {
			const index = data[i];
			const previousLabel = labelLUT[this.annotations[index]];
			if (previousLabel !== undefined && !previousLabel.locked) {
				editableData[counter++] = index;
			}
		}
		editableData.length = counter;
		const eventData = this.getEventData(label, editableData);
		this.eventManager.emit("beforeAnnotation", eventData);
		for (let i = 0; i < editableData.length; i++) {
			const index = editableData[i];
			this.annotations[index] = label.annotationClass;
		}
		this.eventManager.emit("afterAnnotation", eventData);
	}

	/**
	 * Like `annotateWithLabel` but ignores locked labels.
	 *
	 * @param label the label
	 * @param data the indexes to annotate
	 */
	public unsafeAnnotateWithLabel(label: Label, data: AnnotationData) {
		const eventData = this.getEventData(label, data);
		this.eventManager.emit("beforeAnnotation", eventData);
		for (let i = 0; i < data.length; i++) {
			const index = data[i];
			this.annotations[index] = label.annotationClass;
		}
		this.eventManager.emit("afterAnnotation", eventData);
	}

	private getEventData(label: Label, data: AnnotationData) {
		return {
			data: { label, data },
			annotations: this.annotations,
		};
	}

	/**
	 * Resets all annotation data and clears all observers
	 */
	public destroy(): void {
		this.annotations = new Uint8Array();
		this.eventManager.destroy();
	}
}
