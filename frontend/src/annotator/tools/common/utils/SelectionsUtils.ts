import {
	Line3,
	type Matrix4,
	type Mesh as ThreeMesh,
	type Vector3,
} from "three";
import {
	CONTAINED,
	type ExtendedTriangle,
	INTERSECTED,
	NOT_INTERSECTED,
} from "three-mesh-bvh";
import {
	getConvexHull,
	lineCrossesLine,
	pointRayCrossesSegments,
} from "./MathUtils";
import type { SelectionBuffer } from "./SelectionBuffer";

/**
 * Calculates the intersection of a mesh with a selection polygon.
 *  This function uses the Three.js BVH (Bounding Volume Hierarchy) to efficiently
 * determine which parts of the mesh are intersected by the selection polygon.
 * It creates a bounding box around the selection polygon, transforms it to screen space,
 * and checks for intersections with the mesh geometry.
 *
 * @param mesh - The Three.js mesh to check for intersections.
 * @param toScreenSpaceMatrix - The matrix to transform the bounding box to screen space.
 * @param boxPoints - An array of Vector3 points representing the corners of the bounding box.
 * @param boxLines - An array of Line3 objects representing the edges of the bounding box.
 * @param polygonSegments - An array of Line3 objects representing the segments of the selection polygon.
 * @param perBoundsSegments - An array of arrays of Line3 objects representing segments for each bounding box depth.
 * @param selectionPoints - An array of numbers representing the points of the selection polygon.
 * @returns An object containing two arrays: `containedIndices` and `intersectedIndices`.
 * `containedIndices` contains the indices of the mesh faces that are completely contained within
 * the selection polygon, while `intersectedIndices` contains the indices of the mesh faces that are
 * intersected by the selection polygon.
 */
export function calculatePolygonIntersection(
	mesh: ThreeMesh,
	toScreenSpaceMatrix: Matrix4,
	boxPoints: Vector3[],
	boxLines: Line3[],
	polygonSegments: Line3[],
	perBoundsSegments: Line3[][],
	selectionPoints: number[],
	selectionBuffer: SelectionBuffer
): void {
	// create scratch points and lines to use for selection
	while (polygonSegments.length < selectionPoints.length) {
		polygonSegments.push(new Line3());
	}
	polygonSegments.length = selectionPoints.length;

	for (let s = 0, l = selectionPoints.length; s < l; s += 3) {
		const line = polygonSegments[s];
		const sNext = (s + 3) % l;
		line.start.x = selectionPoints[s];
		line.start.y = selectionPoints[s + 1];

		line.end.x = selectionPoints[sNext];
		line.end.y = selectionPoints[sNext + 1];
	}

	selectionBuffer.clear();

	mesh.geometry.boundsTree!.shapecast({
		intersectsBounds: (
			box: {
				min: Vector3;
				max: Vector3;
			},
			_isLeaf: boolean,
			_score,
			depth: number
		) => {
			// Get the bounding box points
			const { min, max } = box;
			let index = 0;

			let minY = Infinity;
			let maxY = -Infinity;
			let minX = Infinity;
			for (let x = 0; x <= 1; x++) {
				for (let y = 0; y <= 1; y++) {
					for (let z = 0; z <= 1; z++) {
						const v = boxPoints[index];
						v.x = x === 0 ? min.x : max.x;
						v.y = y === 0 ? min.y : max.y;
						v.z = z === 0 ? min.z : max.z;

						v.applyMatrix4(toScreenSpaceMatrix);
						index++;

						if (v.y < minY) minY = v.y;
						if (v.y > maxY) maxY = v.y;
						if (v.x < minX) minX = v.x;
					}
				}
			}

			// Find all the relevant segments here and cache them in the above array for
			// subsequent child checks to use.
			const parentSegments =
				perBoundsSegments[depth - 1] || polygonSegments;
			const segmentsToCheck = perBoundsSegments[depth] || [];
			segmentsToCheck.length = 0;
			perBoundsSegments[depth] = segmentsToCheck;
			for (let i = 0, l = parentSegments.length; i < l; i++) {
				const line = parentSegments[i];
				const sx = line.start.x;
				const sy = line.start.y;
				const ex = line.end.x;
				const ey = line.end.y;
				if (sx < minX && ex < minX) continue;

				const startAbove = sy > maxY;
				const endAbove = ey > maxY;
				if (startAbove && endAbove) continue;

				const startBelow = sy < minY;
				const endBelow = ey < minY;
				if (startBelow && endBelow) continue;

				segmentsToCheck.push(line);
			}

			if (segmentsToCheck.length === 0) {
				return NOT_INTERSECTED;
			}

			// Get the screen space hull lines
			const hull = getConvexHull(boxPoints);
			if (!hull) {
				// this works?
				return INTERSECTED;
			}

			const lines = hull.map((p, i) => {
				const nextP = hull[(i + 1) % hull.length];
				const line = boxLines[i];
				line.start.copy(p);
				line.end.copy(nextP);
				return line;
			});

			// If a lasso point is inside the hull then it's intersected and cannot be contained
			if (
				pointRayCrossesSegments(segmentsToCheck[0].start, lines) % 2 ===
				1
			) {
				return INTERSECTED;
			}

			// check if the screen space hull is in the lasso
			let crossings = 0;
			for (let i = 0, l = hull.length; i < l; i++) {
				const v = hull[i];
				const pCrossings = pointRayCrossesSegments(v, segmentsToCheck);

				if (i === 0) {
					crossings = pCrossings;
				}

				// if two points on the hull have different amounts of crossings then
				// it can only be intersected
				if (crossings !== pCrossings) {
					return INTERSECTED;
				}
			}

			// check if there are any intersections
			for (let i = 0, l = lines.length; i < l; i++) {
				const boxLine = lines[i];
				for (let s = 0, ls = segmentsToCheck.length; s < ls; s++) {
					if (lineCrossesLine(boxLine, segmentsToCheck[s])) {
						return INTERSECTED;
					}
				}
			}

			return crossings % 2 === 0 ? NOT_INTERSECTED : CONTAINED;
		},

		intersectsTriangle: (
			triangle: ExtendedTriangle,
			index: number,
			contained: boolean,
			depth: number
		) => {
			const segmentsToCheck = perBoundsSegments[depth];

			// if the parent bounds were marked as contained, the triangle is fully contained
			if (contained) {
				selectionBuffer.pushContained(index);
				return false;
			}

			// project triangle vertices to screen space, cloning them to avoid modifying original data
			const vertices = [
				triangle.a.clone(),
				triangle.b.clone(),
				triangle.c.clone(),
			];
			vertices.forEach((v) => v.applyMatrix4(toScreenSpaceMatrix));

			// check how many vertices are inside the lasso
			let insideCount = 0;
			for (const v of vertices) {
				if (pointRayCrossesSegments(v, segmentsToCheck) % 2 === 1) {
					insideCount++;
				}
			}

			// get the lines for the triangle
			const lines = [boxLines[0], boxLines[1], boxLines[2]];
			lines[0].set(vertices[0], vertices[1]);
			lines[1].set(vertices[1], vertices[2]);
			lines[2].set(vertices[2], vertices[0]);

			// check if any of the triangle's edges intersect the lasso's edges
			let edgeIntersects = false;
			for (const line of lines) {
				for (const segment of segmentsToCheck) {
					if (lineCrossesLine(line, segment)) {
						edgeIntersects = true;
						break;
					}
				}
				if (edgeIntersects) break;
			}

			// check if the lasso is inside the triangle (e.g. a small lasso in a large triangle)
			if (
				!edgeIntersects &&
				insideCount === 0 &&
				segmentsToCheck.length > 0
			) {
				if (
					pointRayCrossesSegments(segmentsToCheck[0].start, lines) %
						2 ===
					1
				) {
					edgeIntersects = true; // Treat this as an intersection
				}
			}

			// Classify the triangle based on the checks
			if (insideCount === 3 && !edgeIntersects) {
				// All vertices are inside and no edges cross, so it's fully contained.
				selectionBuffer.pushContained(index);
			} else if (insideCount > 0 || edgeIntersects) {
				// Some vertices are inside, or an edge is crossed, so it's intersected.
				selectionBuffer.pushIntersected(index);
			}

			return false; // continue shapecast
		},
	});
}
