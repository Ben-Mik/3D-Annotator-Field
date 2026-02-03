import { type Object3D } from "three";
import { type Destroyable, type Updatable } from "~entity/Types";

/**
 * A SceneSubject
 */
export interface SceneSubject extends Updatable, Destroyable {
	/**
	 * Returns objects as Iterable
	 *
	 * @returns a Iterable
	 */
	getObjects(): Object3D[];
}
