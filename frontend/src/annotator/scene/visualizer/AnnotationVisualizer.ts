import type { LabelManager } from "~annotator/annotation/LabelManager";
import {
	isAnnotationsLUT,
	type AnnotationsLUT,
	type LabeledAnnotationData,
} from "~entity/Annotation";
import { type Destroyable } from "~entity/Types";
import { NumberSetting } from "~settings/Settings";
import {
	createSettingsManager,
	type NestedSettings,
} from "~settings/SettingsManager";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";

export const VISUALIZER_SETTINGS = {
	opacity: new NumberSetting("opacity", { initial: 0.6, min: 0, max: 1 }),
};

const settingsRegistry = new LocalStorageSettingsRegistry("visualizer-4Yb5i");
settingsRegistry.registerMultiple(VISUALIZER_SETTINGS);

/**
 * A visualizer for AnnotationData
 */
export interface AnnotationVisualizer extends Destroyable {
	/**
	 * Visualizes the annotation data with the included label.
	 *
	 * @param data the {@link LabeledAnnotationData} and {@link AnnotationsLUT} with the
	 * 			   changes already applied
	 */
	visualize(data: LabeledAnnotationData, annotations: AnnotationsLUT): void;

	/**
	 * Takes an array of {@link LabeledAnnotationData} or an {@link AnnotationsLUT} to
	 * visualize the whole model (redraws everything).
	 *
	 * @param data an array of {@link LabeledAnnotationData} or the {@link AnnotationsLUT}
	 * @param overlayOnly When `true`, assumes no labels were removed and performs an
	 * 					  additive overlay without resetting pixels to their original colors.
	 */
	visualizeAll(data: LabeledAnnotationData[]): void;
	visualizeAll(data: AnnotationsLUT, overlayOnly?: boolean): void;
}

export abstract class BaseVisualizer<
	T extends NestedSettings = typeof VISUALIZER_SETTINGS
> implements AnnotationVisualizer
{
	protected readonly labelManager: LabelManager;
	protected settings: ReturnType<typeof createSettingsManager<T>>;

	constructor(settings: T, labelManager: LabelManager) {
		this.settings = createSettingsManager(settings);
		this.labelManager = labelManager;
	}

	public abstract visualize(
		data: LabeledAnnotationData,
		annotations: AnnotationsLUT
	): void;

	public visualizeAll(
		dataOrLUT: LabeledAnnotationData[] | AnnotationsLUT,
		overlayOnly = false
	): void {
		const start = performance.now();
		if (isAnnotationsLUT(dataOrLUT)) {
			this.visualizeAllWithAnnotationsLUT(dataOrLUT, overlayOnly);
		} else {
			this.visualizeAllWithLabeledAnnotationData(dataOrLUT);
		}
		const time = performance.now() - start;
		console.log(`Visualize mode 'all' took ${time.toFixed(2)}ms.`);
	}

	protected abstract visualizeAllWithLabeledAnnotationData(
		data: LabeledAnnotationData[]
	): void;

	protected abstract visualizeAllWithAnnotationsLUT(
		data: AnnotationsLUT,
		overlayOnly: boolean
	): void;

	public destroy(): void {
		this.settings.unsubscribeAll();
	}
}
