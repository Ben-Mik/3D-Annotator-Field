import { type APIResult, type APIResultAbort } from "~api/API";
import { type Errors, type SingularError } from "~api/Errors";

/**
 * A point on a 3D model bound to a string reference (`value`) that
 * identifies an entry in an external database. Annotator never queries
 * the database — it only substitutes `value` into user-configured URL
 * templates.
 */
export interface DbLinkPoint {
	readonly id: string;
	position: { x: number; y: number; z: number };
	value: string;
}

/**
 * Project-level configuration for the DB-link feature. All three fields are
 * optional (empty string when unset). Owner-only on the backend.
 */
export interface DbLinkConfig {
	webclientUrl: string;
	lookupUrlTemplate: string;
	createNewUrlTemplate: string;
}

export const EMPTY_DB_LINK_CONFIG: DbLinkConfig = {
	webclientUrl: "",
	lookupUrlTemplate: "",
	createNewUrlTemplate: "",
};

/**
 * The full DB-link API surface — what the dblink module installs onto the
 * API instance when enabled. Loaded from `~dblink/api.ts`.
 */
export interface DbLinkClient {
	loadPoints(
		modelId: number,
		abort?: AbortController
	): APIResultAbort<DbLinkPoint[]>;

	savePoints(
		modelId: number,
		points: DbLinkPoint[]
	): APIResult<void, SingularError<Errors.NETWORK | Errors.LOCKED>>;

	listProjectValues(
		projectId: number,
		abort?: AbortController
	): APIResultAbort<string[]>;

	getConfig(
		projectId: number,
		abort?: AbortController
	): APIResultAbort<DbLinkConfig>;

	updateConfig(
		projectId: number,
		config: DbLinkConfig
	): APIResult<DbLinkConfig>;
}
