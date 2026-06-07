import {
	type CircuitValidationResult,
	type ExecutionCircuitSpec,
	executionCircuitSpecSchema,
} from "./schemas";
import { validateExecutionCircuitSpec } from "./validate";

export type ExecutionCircuitImportResult =
	| {
			ok: true;
			spec: ExecutionCircuitSpec;
			validation: CircuitValidationResult;
	  }
	| {
			ok: false;
			validation: CircuitValidationResult;
			parseError?: string;
	  };

export function exportExecutionCircuitSpec(spec: ExecutionCircuitSpec): string {
	const validation = validateExecutionCircuitSpec(spec);
	if (!validation.ok) {
		throw new Error("Cannot export invalid execution circuit spec.");
	}

	return `${JSON.stringify(spec, null, 2)}\n`;
}

export function importExecutionCircuitSpec(
	serialized: string,
): ExecutionCircuitImportResult {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(serialized) as unknown;
	} catch (error) {
		return {
			ok: false,
			parseError:
				error instanceof Error
					? error.message
					: "Invalid execution circuit JSON.",
			validation: {
				ok: false,
				errors: [
					{
						path: "",
						code: "invalid_json",
						message: "Execution circuit import must be valid JSON.",
					},
				],
			},
		};
	}

	const validation = validateExecutionCircuitSpec(parsedJson);
	const parsedSpec = executionCircuitSpecSchema.safeParse(parsedJson);

	if (!validation.ok || !parsedSpec.success) {
		return { ok: false, validation };
	}

	return {
		ok: true,
		spec: parsedSpec.data,
		validation,
	};
}
