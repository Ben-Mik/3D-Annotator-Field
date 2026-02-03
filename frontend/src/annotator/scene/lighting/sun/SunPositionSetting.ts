import { Vector3 } from "three";
import { PERSPECTIVE_TO_VECTOR3, type Perspective } from "~entity/Perspective";
import { AbstractSetting } from "~settings/AbstractSetting";

interface SerializedVector3 {
	x: number;
	y: number;
	z: number;
}

export interface SunPostionSettingValue<
	T extends Vector3 | SerializedVector3 = Vector3
> {
	vector: T;
	perspective: Perspective | null;
}

export class SunPositionSetting extends AbstractSetting<SunPostionSettingValue> {
	public setToVector(vector: Vector3) {
		const value = {
			vector,
			perspective: null,
		};
		this.set(value);
	}

	public setToPerspective(perspective: Perspective) {
		const value = {
			vector: PERSPECTIVE_TO_VECTOR3[perspective],
			perspective,
		};
		this.set(value);
	}

	public override serialize(): string {
		const object = {
			vector: {
				x: this.value.vector.x,
				y: this.value.vector.y,
				z: this.value.vector.z,
			},
			perspective: this.value.perspective,
		} satisfies SunPostionSettingValue<SerializedVector3>;
		return JSON.stringify(object);
	}

	public override deserialize(value: string): SunPostionSettingValue {
		const object = JSON.parse(
			value
		) as SunPostionSettingValue<SerializedVector3>;
		return {
			vector: new Vector3(
				object.vector.x,
				object.vector.y,
				object.vector.z
			),
			perspective: object.perspective,
		};
	}
}
