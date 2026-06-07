// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { Rox } from "../client";

export abstract class APIResource {
	protected _client: Rox;

	constructor(client: Rox) {
		this._client = client;
	}
}
