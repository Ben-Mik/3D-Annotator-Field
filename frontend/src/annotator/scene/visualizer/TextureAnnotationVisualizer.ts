import type { CanvasTexture } from "three";
import type { LabelManager } from "~annotator/annotation/LabelManager";
import {
	type AnnotationsLUT,
	type LabeledAnnotationData,
	type LabelLUT,
} from "~entity/Annotation";
import { PercentageSetting } from "~settings/Settings";
import { LocalStorageSettingsRegistry } from "~settings/SettingsRegistry";
import { fastRound } from "~util/Math";
import { createTimeoutProxy } from "~util/Timeout";
import type { TextureMesh } from "../model/TextureMesh";
import { type Scene } from "../Scene";
import { BaseVisualizer, VISUALIZER_SETTINGS } from "./AnnotationVisualizer";

export const TEXTURE_VISUALIZER_SETTINGS = {
	bufferThreshold: new PercentageSetting("bufferThreshold", 0.1),
	bufferAllThreshold: new PercentageSetting("bufferAllThreshold", 15),
};

const settingsRegistry = new LocalStorageSettingsRegistry(
	"textureVisualizer-7jCL5"
);
settingsRegistry.registerMultiple(TEXTURE_VISUALIZER_SETTINGS);

const SETTINGS = {
	...VISUALIZER_SETTINGS,
	...TEXTURE_VISUALIZER_SETTINGS,
};

const LOG_INTERVAL = 750; // ms

/**
 * A visualizer for texture annotated mesh data
 */
export class TextureAnnotationVisualizer extends BaseVisualizer<
	typeof SETTINGS
> {
	private readonly canvas: HTMLCanvasElement;
	private readonly canvasContext: CanvasRenderingContext2D;
	private readonly canvasTexture: CanvasTexture;
	private readonly originalColors: Uint8ClampedArray;

	private readonly pixelCountFactor: number;

	private readonly visibleLUT: Uint8Array;
	private readonly labelColorsR: Float32Array;
	private readonly labelColorsG: Float32Array;
	private readonly labelColorsB: Float32Array;

	private readonly currentImage: ImageData;

	private readonly throttledLog: (s: string, execute?: boolean) => void;

	/**
	 * Constructs a new instance of {@link MeshAnnotationVisualizer}
	 *
	 * @param scene a {@link Scene} of type {@link Mesh}
	 */
	constructor(scene: Scene<TextureMesh>, labelManager: LabelManager) {
		super(SETTINGS, labelManager);
		const model = scene.getModel();
		this.canvas = model.getCanvas();
		this.canvasContext = model.getCanvasContext();
		this.canvasTexture = model.getCanvasTexture();
		const image = this.canvasContext.getImageData(
			0,
			0,
			this.canvas.width,
			this.canvas.height
		);

		const stats = scene.getModel().getTextureStats();
		this.pixelCountFactor = (1 / stats.pixelCount) * 100;

		const labelLUT = labelManager.getLabelLUT();
		this.visibleLUT = new Uint8Array(labelLUT.length);
		this.labelColorsR = new Float32Array(labelLUT.length);
		this.labelColorsG = new Float32Array(labelLUT.length);
		this.labelColorsB = new Float32Array(labelLUT.length);

		this.updateVisibleLUT(labelLUT);
		this.updateColorLUTs(labelLUT, this.settings.opacity);

		this.settings.onBeforeChange("opacity", ({ new: opacity }) => {
			this.updateColorLUTs(labelLUT, opacity);
		});

		const sharedBuffer = new SharedArrayBuffer(image.data.byteLength);
		this.originalColors = new Uint8ClampedArray(sharedBuffer);
		this.originalColors.set(image.data);

		this.currentImage = image;

		this.throttledLog = createTimeoutProxy((s: string) => {
			console.log(s);
		}, LOG_INTERVAL);
	}

	public getOriginalColors() {
		return this.originalColors;
	}

	public visualize(data: LabeledAnnotationData, annotations: AnnotationsLUT) {
		const start = performance.now();

		const ratio = data.data.length * this.pixelCountFactor;
		let mode = "";
		if (ratio >= this.settings.bufferAllThreshold) {
			this.visualizeAllWithAnnotationsLUT(
				annotations,
				!data.label.isNeutral
			);
			mode = "all";
		} else if (ratio >= this.settings.bufferThreshold) {
			this.visualizeWithImageData(data);
			mode = "buffer";
		} else {
			this.visualizeWithFill(data);
			mode = "fill";
		}

		const time = performance.now() - start;
		this.throttledLog(
			`Visualize mode '${mode}' took ${time.toFixed(
				2
			)}ms for ${ratio.toFixed(3)}% of pixels.`
		);
	}

	private visualizeWithFill({ label, data }: LabeledAnnotationData) {
		const current = this.currentImage.data;
		const original = this.originalColors;
		const width = this.canvas.width;

		let labelR, labelG, labelB;
		let oneMinusOpacity;
		if (!label.isNeutral && label.annotationVisible) {
			const annotationClass = label.annotationClass;
			labelR = this.labelColorsR[annotationClass];
			labelG = this.labelColorsG[annotationClass];
			labelB = this.labelColorsB[annotationClass];
			oneMinusOpacity = 1 - this.settings.opacity;
		} else {
			labelR = labelG = labelB = 0;
			oneMinusOpacity = 1;
		}

		const context = this.canvasContext;

		for (let i = 0; i < data.length; i++) {
			const index = data[i]!;
			const p = index * 4; // position in ImageData (*4 for RGBA)

			const r = fastRound(labelR + oneMinusOpacity * original[p]);
			const g = fastRound(labelG + oneMinusOpacity * original[p + 1]);
			const b = fastRound(labelB + oneMinusOpacity * original[p + 2]);

			current[p] = r;
			current[p + 1] = g;
			current[p + 2] = b;

			const x = index % width;
			const y = Math.floor(index / width);

			context.fillStyle = `rgb(${r} ${g} ${b})`;
			context.fillRect(x, y, 1, 1);
		}

		this.canvasTexture.needsUpdate = true;
	}

	private visualizeWithImageData({ label, data }: LabeledAnnotationData) {
		const current = this.currentImage.data;
		const original = this.originalColors;
		const width = this.canvas.width;
		const height = this.canvas.height;

		let labelR, labelG, labelB;
		let oneMinusOpacity = 1;
		if (!label.isNeutral && label.annotationVisible) {
			const lid = label.annotationClass;
			labelR = this.labelColorsR[lid];
			labelG = this.labelColorsG[lid];
			labelB = this.labelColorsB[lid];
			oneMinusOpacity = 1 - this.settings.opacity;
		} else {
			labelR = labelG = labelB = 0;
			oneMinusOpacity = 1;
		}

		let minX = width;
		let minY = height;
		let maxX = 0;
		let maxY = 0;

		for (let i = 0; i < data.length; i++) {
			const index = data[i]!;
			const p = index * 4; // position in ImageData (*4 for RGBA)

			const r = fastRound(labelR + oneMinusOpacity * original[p]);
			const g = fastRound(labelG + oneMinusOpacity * original[p + 1]);
			const b = fastRound(labelB + oneMinusOpacity * original[p + 2]);

			current[p] = r;
			current[p + 1] = g;
			current[p + 2] = b;

			const x = index % width;
			const y = Math.floor(index / width);

			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}

		const dirtyW = maxX - minX + 1;
		const dirtyH = maxY - minY + 1;
		this.canvasContext.putImageData(
			this.currentImage,
			0,
			0,
			minX,
			minY,
			dirtyW,
			dirtyH
		);
		this.canvasTexture.needsUpdate = true;
	}

	protected visualizeAllWithLabeledAnnotationData(
		data: LabeledAnnotationData[]
	): void {
		for (const currentData of data) {
			this.visualizeWithImageData(currentData);
		}
	}

	protected visualizeAllWithAnnotationsLUT(
		annotations: AnnotationsLUT,
		overlayOnly: boolean
	) {
		const current = this.currentImage.data;
		const original = this.originalColors;

		const labelLUT = this.labelManager.getLabelLUT();
		const oneMinusOpacity = 1 - this.settings.opacity;

		this.updateVisibleLUT(labelLUT);

		const visibleLUT = this.visibleLUT;

		const labelColorsR = this.labelColorsR;
		const labelsColorsG = this.labelColorsG;
		const labelColorsB = this.labelColorsB;

		const n = annotations.length;
		let p = 0;

		if (overlayOnly) {
			for (let i = 0; i < n; i++, p += 4) {
				const annotationClass = annotations[i]!;
				const visible = visibleLUT[annotationClass];

				if (!visible) {
					// don't restore original, only additive changes to apply
					continue;
				}

				current[p] = fastRound(
					labelColorsR[annotationClass] +
						oneMinusOpacity * original[p]
				);
				current[p + 1] = fastRound(
					labelsColorsG[annotationClass] +
						oneMinusOpacity * original[p + 1]
				);
				current[p + 2] = fastRound(
					labelColorsB[annotationClass] +
						oneMinusOpacity * original[p + 2]
				);
			}
		} else {
			for (let i = 0; i < n; i++, p += 4) {
				const annotationClass = annotations[i]!;
				const visible = visibleLUT[annotationClass];

				if (!visible) {
					// restore original
					current[p] = original[p];
					current[p + 1] = original[p + 1];
					current[p + 2] = original[p + 2];
				} else {
					// blend
					current[p] = fastRound(
						labelColorsR[annotationClass] +
							oneMinusOpacity * original[p]
					);
					current[p + 1] = fastRound(
						labelsColorsG[annotationClass] +
							oneMinusOpacity * original[p + 1]
					);
					current[p + 2] = fastRound(
						labelColorsB[annotationClass] +
							oneMinusOpacity * original[p + 2]
					);
				}
			}
		}

		this.canvasContext.putImageData(this.currentImage, 0, 0);
		this.canvasTexture.needsUpdate = true;
	}

	private updateVisibleLUT(labelLUT: LabelLUT) {
		const visibleLUT = this.visibleLUT;

		for (
			let annotationClass = 0;
			annotationClass < labelLUT.length;
			annotationClass++
		) {
			const label = labelLUT[annotationClass];
			if (!label) {
				continue;
			}

			if (label.annotationVisible && !label.isNeutral) {
				visibleLUT[annotationClass] = 1;
			} else {
				visibleLUT[annotationClass] = 0;
			}
		}
	}

	private updateColorLUTs(labelLUT: LabelLUT, alpha: number) {
		const colorsR = this.labelColorsR;
		const colorsG = this.labelColorsG;
		const colorsB = this.labelColorsB;

		for (
			let annotationClass = 0;
			annotationClass < labelLUT.length;
			annotationClass++
		) {
			const label = labelLUT[annotationClass];
			if (!label) {
				continue;
			}

			const color = label.color.intValues;
			colorsR[annotationClass] = alpha * color[0];
			colorsG[annotationClass] = alpha * color[1];
			colorsB[annotationClass] = alpha * color[2];
		}
	}
}
