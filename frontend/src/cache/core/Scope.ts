import { assertUnreachable, type Prettify } from "~util/TypeScript";

/**
 * Represents a global scope with no specific restrictions.
 * Resources in this scope are shared across the entire application.
 */
export type Global = Record<string, never>;

/**
 * Scope restricted to a specific user.
 * Resources are only relevant to the user identified by `userId`.
 */
export type User = { userId: string };

/**
 * Scope restricted to a specific project.
 * Resources belong to the project identified by `projectId`.
 */
export type Project = { projectId: string };

/**
 * Scope restricted to a specific model within a project.
 * Resources belong to the specific model version identified by `modelId` and `projectId`.
 */
export type Model = Prettify<Project & { modelId: string }>;

/**
 * Scope restricted to a specific user's interaction with a specific model.
 * Combines Project, Model, and User constraints.
 */
export type ModelUser = Prettify<Model & User>;

type FullScope = ModelUser;

/**
 * Union type representing all possible scopes for cached data.
 * Scopes define the granularity/visibility of a cached resource.
 */
export type Scope = Global | User | Project | Model | ModelUser;

/**
 * Partial scope used for filtering.
 *
 * `undefined` or `""` (empty string) values are treated as "no constraint".
 */
export type PartialScope = Partial<FullScope>;

/**
 * Discriminant for the "level" of a resource's scope.
 */
export type ScopeKind = "global" | "user" | "project" | "model" | "modelUser";

/**
 * Map a scope kind to its corresponding scope shape.
 *
 * @typeParam K Scope kind.
 */
export type ScopeForKind<K extends ScopeKind> = K extends "global"
	? Global
	: K extends "user"
	? User
	: K extends "project"
	? Project
	: K extends "model"
	? Model
	: K extends "modelUser"
	? ModelUser
	: never;

/**
 * Map a scope shape to its corresponding scope kind.
 *
 * @typeParam S Scope shape.
 */
export type KindForScope<S extends Scope> = S extends ModelUser
	? "modelUser"
	: S extends Model
	? "model"
	: S extends Project
	? "project"
	: S extends User
	? "user"
	: S extends Global
	? "global"
	: never;

/**
 * Compute the effective scope for a resource with a given kind.
 *
 * @example
 * kind = "global"     -> `{}` (no user/project/model)
 * kind = "user"       -> `{ userId }`
 * kind = "project"    -> `{ projectId }`
 * kind = "model"      -> `{ projectId, modelId }`
 * kind = "modelUser"  -> `{ userId, projectId, modelId }`
 *
 * @param scope a Scope (may contain user/project/model).
 * @param kind Scope kind required by the resource.
 * @returns The effective scope used for path and metadata.
 * @throws {Error} If the full scope does not satisfy the required kind.
 */
export function getEffectiveScopeForKind(scope: Scope, kind: ScopeKind): Scope {
	switch (kind) {
		case "global":
			return {};
		case "user":
			if (!("userId" in scope)) {
				throw new Error(
					"Resource with user scope used with incompatible scope."
				);
			}
			return { userId: scope.userId };
		case "project":
			if (!("projectId" in scope)) {
				throw new Error(
					"Resource with project scope used with incompatible scope."
				);
			}
			return { projectId: scope.projectId };
		case "model":
			if (!("projectId" in scope) || !("modelId" in scope)) {
				throw new Error(
					"Resource with model scope used with incompatible scope."
				);
			}
			return {
				projectId: scope.projectId,
				modelId: scope.modelId,
			};
		case "modelUser":
			if (
				!("userId" in scope) ||
				!("projectId" in scope) ||
				!("modelId" in scope)
			) {
				throw new Error(
					"Resource with modelUser scope used with incompatible scope."
				);
			}
			return {
				userId: scope.userId,
				projectId: scope.projectId,
				modelId: scope.modelId,
			};
		default:
			assertUnreachable(kind);
	}
}

/**
 * Check whether a scope has a given key at runtime.
 *
 * @typeParam K - Key in the full scope.
 * @param scope - Scope to inspect.
 * @param key - Key to test.
 * @returns `true` if the scope has the given key.
 */
function hasScopeKey<K extends keyof FullScope>(
	scope: Scope,
	key: K
): scope is Extract<Scope, Record<K, string>> {
	return key in scope;
}

/**
 * Check whether a single scope field matches a filter field.
 *
 * Rules:
 * - If the filter value is `undefined` or `""`: no constraint -> match.
 * - If the filter has a value:
 *   - If the scope lacks that key: no match.
 *   - If values differ: no match.
 *   - Otherwise: match.
 *
 * @typeParam - K Key in the full scope.
 * @param scope - Scope to test.
 * @param filter - Partial scope filter.
 * @param key - Field key to test.
 * @returns `true` if the field matches the filter.
 */
function fieldMatches<K extends keyof ModelUser>(
	scope: Scope,
	filter: PartialScope,
	key: K
): boolean {
	const expected = filter[key];

	if (expected === undefined || expected === "") {
		return true;
	}

	if (!hasScopeKey(scope, key)) {
		return false;
	}

	return scope[key] === expected;
}

/**
 * Checks if a specific Scope matches a set of filter criteria.
 *
 * @param scope - The actual scope to test.
 * @param filter - The criteria (PartialScope) to test against.
 * @returns `true` if the scope satisfies all constraints in the filter or if no filter is provided.
 */
export function scopeMatchesFilter(
	scope: Scope,
	filter?: PartialScope
): boolean {
	if (!filter) {
		return true;
	}

	if (!fieldMatches(scope, filter, "userId")) {
		return false;
	}

	if (!fieldMatches(scope, filter, "projectId")) {
		return false;
	}

	if (!fieldMatches(scope, filter, "modelId")) {
		return false;
	}

	return true;
}
