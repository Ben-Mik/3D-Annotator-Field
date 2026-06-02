import { type AxiosInstance, type AxiosError } from "axios";
import { ResultAsync } from "neverthrow";
import {
	type APIResult,
	type APIResultAbort,
} from "~api/API";
import { Errors, SingularError } from "~api/Errors";
import {
	defaultApiResponseErrorHandler,
	getAbortErrorHandler,
	getNetworkErrorHandler,
} from "~api/v1/errors/ErrorHandler";
import {
	type APIResponseError,
	type AxiosResponseError,
} from "~api/v1/errors/ErrorTypes";
import {
	type DbLinkClient,
	type DbLinkConfig,
	type DbLinkPoint,
	EMPTY_DB_LINK_CONFIG,
} from "./entity";

const PROJECT_ENDPOINT = "projects/";
const MODEL_ENDPOINT = "modelData/";
// ! Other than other endpoints, no slash at the end (mirrors annotationFile)
const DBLINK_FILE_PATH = "dbLinkFile";
const DBLINK_VALUES_PATH = "dbLinkValues/";
const DBLINK_CONFIG_PATH = "dbLinkConfig/";

const DBLINK_FILE_NAME = "dbLinkFile.json";
const JSON_MIME_TYPE = "application/json";

class DbLinkClientImpl implements DbLinkClient {
	private axios: AxiosInstance;

	constructor(axios: AxiosInstance) {
		this.axios = axios;
	}

	public loadPoints(
		modelId: number,
		abort?: AbortController
	): APIResultAbort<DbLinkPoint[]> {
		const endpoint = this.getDbLinkFileEndpoint(modelId);

		const request = this.axios
			.get<Blob>(endpoint, {
				responseType: "blob",
				signal: abort?.signal,
			})
			.then(async ({ data }) => {
				const text = await data.text();
				const parsed: unknown = JSON.parse(text);
				if (!Array.isArray(parsed)) return [];
				return parsed as DbLinkPoint[];
			})
			.catch((error: AxiosError) => {
				if (error.response?.status === 404) {
					return [] as DbLinkPoint[];
				}
				throw error;
			});

		return ResultAsync.fromPromise(request, (error) =>
			getAbortErrorHandler().run(error)
		);
	}

	public savePoints(
		modelId: number,
		points: DbLinkPoint[]
	): APIResult<void, SingularError<Errors.NETWORK | Errors.LOCKED>> {
		const endpoint = this.getDbLinkFileEndpoint(modelId);

		const json = JSON.stringify(points);
		const blob = new Blob([json], { type: JSON_MIME_TYPE });
		const formData = new FormData();
		formData.append("fileFormat", JSON_MIME_TYPE);
		formData.append("file", blob, DBLINK_FILE_NAME);

		const request = this.axios
			.put(endpoint, formData, {
				headers: { "Content-Type": "multipart/form-data" },
			})
			.then(() => {
				return;
			});

		const errorHandler = getNetworkErrorHandler<
			SingularError<Errors.LOCKED>
		>().onAPIResponseError(this.lockedErrorHandler);

		return ResultAsync.fromPromise(request, (error) =>
			errorHandler.run(error)
		);
	}

	public listProjectValues(
		projectId: number,
		abort?: AbortController
	): APIResultAbort<string[]> {
		const endpoint = this.getDbLinkValuesEndpoint(projectId);

		const request = this.axios
			.get<string[]>(endpoint, { signal: abort?.signal })
			.then(({ data }) => data);

		return ResultAsync.fromPromise(request, (error) =>
			getAbortErrorHandler().run(error)
		);
	}

	public getConfig(
		projectId: number,
		abort?: AbortController
	): APIResultAbort<DbLinkConfig> {
		const endpoint = this.getDbLinkConfigEndpoint(projectId);

		const request = this.axios
			.get<DbLinkConfig>(endpoint, { signal: abort?.signal })
			.then(({ data }) => ({
				...EMPTY_DB_LINK_CONFIG,
				...data,
			}));

		return ResultAsync.fromPromise(request, (error) =>
			getAbortErrorHandler().run(error)
		);
	}

	public updateConfig(
		projectId: number,
		config: DbLinkConfig
	): APIResult<DbLinkConfig> {
		const endpoint = this.getDbLinkConfigEndpoint(projectId);

		const request = this.axios
			.put<DbLinkConfig>(endpoint, config)
			.then(({ data }) => ({ ...EMPTY_DB_LINK_CONFIG, ...data }));

		return ResultAsync.fromPromise(request, (error) =>
			getNetworkErrorHandler().run(error)
		);
	}

	private lockedErrorHandler(
		this: void,
		apiError: APIResponseError,
		axiosError: AxiosResponseError
	): SingularError<Errors.LOCKED> {
		// spell-checker:disable-next-line
		if (apiError.status === 403 && apiError.code === "modeldata_locked") {
			return new SingularError(Errors.LOCKED);
		} else {
			defaultApiResponseErrorHandler(apiError, axiosError);
		}
	}

	private getDbLinkFileEndpoint(modelId: number) {
		return MODEL_ENDPOINT + modelId + "/" + DBLINK_FILE_PATH;
	}

	private getDbLinkValuesEndpoint(projectId: number) {
		return PROJECT_ENDPOINT + projectId + "/" + DBLINK_VALUES_PATH;
	}

	private getDbLinkConfigEndpoint(projectId: number) {
		return PROJECT_ENDPOINT + projectId + "/" + DBLINK_CONFIG_PATH;
	}
}

/**
 * Factory used by APIv1 (when DB-link is enabled at build time) to install
 * the DB-link client onto the API instance.
 */
export function createDbLinkClient(axios: AxiosInstance): DbLinkClient {
	return new DbLinkClientImpl(axios);
}
