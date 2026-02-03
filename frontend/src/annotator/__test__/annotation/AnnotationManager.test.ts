import { vi } from "vitest";
import {
	AnnotationManager,
	type AnnotationManagerEventData,
} from "~annotator/annotation/AnnotationManager";
import { LabelManager } from "~annotator/annotation/LabelManager";
import {
	NEUTRAL_LABEL,
	type Label,
	type LabeledAnnotationData,
} from "~entity/Annotation";
import { createLabel } from "~entity/__test__/Annotation.test";

describe("AnnotationManager", () => {
	let label1: Label;
	let labelManager: LabelManager;
	let annotationManager: AnnotationManager;

	beforeEach(() => {
		label1 = createLabel(0, 0);
		labelManager = new LabelManager([label1]);
		annotationManager = new AnnotationManager(10, labelManager);
	});

	test("constructor()/getAnnotations() indexSize", () => {
		const indexCount = 5;
		const manager = new AnnotationManager(indexCount, labelManager);

		expect(manager.getAnnotationDataLUT().length).toBe(indexCount);
	});

	test("annotate() one index", () => {
		annotationManager!.annotate([0]);

		const annotations = annotationManager!.getAnnotationDataLUT();
		expect(annotations[0]).toBe(label1!.annotationClass);

		for (let i = 1; i < annotations.length; i++) {
			expect(annotations[i]).toBe(NEUTRAL_LABEL.annotationClass);
		}
	});

	test("annotate() multiple indices", () => {
		annotationManager!.annotate([0, 2, 4]);

		const annotations = annotationManager!.getAnnotationDataLUT();
		expect(annotations[0]).toBe(label1!.annotationClass);

		expect(annotations[1]).toBe(NEUTRAL_LABEL.annotationClass);

		expect(annotations[2]).toBe(label1!.annotationClass);

		expect(annotations[3]).toBe(NEUTRAL_LABEL.annotationClass);

		expect(annotations[4]).toBe(label1!.annotationClass);
	});

	test("loadAnnotations()", () => {
		const label2 = createLabel(1, 1);
		const label3 = createLabel(2, 2);

		const data = new Uint8Array([
			NEUTRAL_LABEL.annotationClass,
			label1.annotationClass,
			label2.annotationClass,
			label3.annotationClass,
			NEUTRAL_LABEL.annotationClass,
			NEUTRAL_LABEL.annotationClass,
			NEUTRAL_LABEL.annotationClass,
			NEUTRAL_LABEL.annotationClass,
			NEUTRAL_LABEL.annotationClass,
			NEUTRAL_LABEL.annotationClass,
		]);

		annotationManager.loadAnnotations(data);

		const annotations = annotationManager.getAnnotationDataLUT();

		expect(annotations).toEqual(data);
	});

	test("addAnnotationObserver()", () => {
		const data = [0, 2, 4];
		let observedData: LabeledAnnotationData;

		const observer = vi.fn((event: AnnotationManagerEventData) => {
			observedData = event.data;
		});

		annotationManager.on("beforeAnnotation", observer);
		annotationManager.annotate(data);

		expect(observer.mock.calls.length).toBe(1);
		expect(observedData!).toEqual({ label: label1, data: data });
	});

	test("unsubscribe observer", () => {
		const observer = vi.fn();

		const unsubscribe = annotationManager.on("beforeAnnotation", observer);
		unsubscribe();
		annotationManager.annotate([0]);
		expect(observer.mock.calls.length).toBe(0);
	});

	test("destroy() clears data", () => {
		annotationManager.annotate([0, 1, 3, 4]);
		annotationManager.destroy();
		const data = annotationManager.getAnnotationDataLUT();
		for (const index of data) {
			expect(index).toEqual(NEUTRAL_LABEL.annotationClass);
		}
	});

	test("destroy() clears observers", () => {
		const observer = vi.fn();
		annotationManager.on("beforeAnnotation", observer);
		annotationManager.destroy();

		annotationManager.annotate([0]);
		expect(observer.mock.calls.length).toBe(0);
	});
});
