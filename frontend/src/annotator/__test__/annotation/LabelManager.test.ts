import { vi } from "vitest";
import { LabelManager } from "~annotator/annotation/LabelManager";
import { NEUTRAL_LABEL, type Label } from "~entity/Annotation";
import { createLabel, createLabels } from "~entity/__test__/Annotation.test";

describe("LabelManager", () => {
	let labels: Label[];
	let labelManager: LabelManager;

	beforeEach(() => {
		labels = createLabels(5);
		labelManager = new LabelManager(labels);
	});

	test("constructor: empty labels array", () => {
		expect(() => {
			new LabelManager([]);
		}).toThrow("empty");
	});

	test("getLabels()", () => {
		expect(labelManager!.getLabels()).toEqual(labels);
	});

	test("getLabels() value is new array", () => {
		const returnedLabels = labelManager.getLabels();
		returnedLabels.push(createLabel());
		expect(labelManager.getLabels()).toEqual(labels);
	});

	test("selectLabel()", () => {
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[0]);

		labelManager.selectLabel(labels[1]);
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[1]);

		labelManager.selectLabel(labels[0]);
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[0]);
	});

	test("selectLabel() with illegal label", () => {
		expect(() => {
			labelManager.selectLabel(createLabel(5, 5));
		}).toThrow("label");

		labelManager.selectLabel(labels[0]);
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[0]);
	});

	test("selectEraser()", () => {
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[0]);

		labelManager.selectEraser();
		expect(labelManager.getActiveLabel()).toStrictEqual(NEUTRAL_LABEL);

		labelManager.selectLabel(labels[0]);
		expect(labelManager.getActiveLabel()).toStrictEqual(labels[0]);
	});

	test("isEraserSelected()", () => {
		expect(labelManager.isEraserSelected()).toBe(false);
		labelManager.selectEraser();
		expect(labelManager.isEraserSelected()).toBe(true);
		labelManager.selectLabel(labels[0]);
		expect(labelManager.isEraserSelected()).toBe(false);
	});

	test("addActiveLabelObserver()", () => {
		let observedLabel: Label;

		const observer = vi.fn((data: Label) => {
			observedLabel = data;
		});

		labelManager.on("activeLabelChange", observer);
		expect(observer.mock.calls.length).toBe(0);

		labelManager.selectLabel(labels[1]);
		expect(observer.mock.calls.length).toBe(1);
		expect(observedLabel!).toEqual(labels[1]);

		labelManager.selectLabel(labels[2]);
		labelManager.selectLabel(labels[3]);
		expect(observer.mock.calls.length).toBe(3);
		expect(observedLabel!).toEqual(labels[3]);

		labelManager.selectEraser();
		expect(observer.mock.calls.length).toBe(4);
		expect(observedLabel!).toEqual(NEUTRAL_LABEL);
	});

	test("addActiveLabelObserver() unsubscribe", () => {
		const observer = vi.fn();

		const unsubscribe1 = labelManager.on("activeLabelChange", observer);
		expect(observer.mock.calls.length).toBe(0);

		labelManager.selectLabel(labels[1]);
		expect(observer.mock.calls.length).toBe(1);

		unsubscribe1();

		labelManager.selectLabel(labels[2]);
		labelManager.selectLabel(labels[3]);
		expect(observer.mock.calls.length).toBe(1);

		observer.mockClear();
		const unsubscribe2 = labelManager.on("activeLabelChange", observer);
		expect(observer.mock.calls.length).toBe(0);

		labelManager.selectEraser();
		expect(observer.mock.calls.length).toBe(1);

		unsubscribe2();

		labelManager.selectLabel(labels[0]);
		labelManager.selectEraser();
		labelManager.selectLabel(labels[1]);
		expect(observer.mock.calls.length).toBe(1);
	});
});
