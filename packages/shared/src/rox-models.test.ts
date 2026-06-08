import { describe, expect, it } from "bun:test";
import {
	isFreeModel,
	ROX_R1,
	ROX_R1_MIRRORS,
	ROX_R1_MODEL_ID,
} from "./rox-models";

describe("rox-models", () => {
	it("rox r1 is a free-forever, zero-priced model", () => {
		expect(ROX_R1.modelId).toBe(ROX_R1_MODEL_ID);
		expect(ROX_R1.isFree).toBe(true);
		expect(ROX_R1.publicUsdPerMIn).toBe(0);
		expect(ROX_R1.publicUsdPerMOut).toBe(0);
		expect(isFreeModel(ROX_R1)).toBe(true);
	});

	it("rox r1 mirrors groq-compound-latest capabilities", () => {
		expect(ROX_R1_MIRRORS).toBe("groq-compound-latest");
		expect(ROX_R1.tools.toolCall).toBe(true);
		expect(ROX_R1.tools.supportedTools).toContain("web_search");
		expect(ROX_R1.limits.contextWindow).toBe(131_072);
	});

	it("isFreeModel reflects the isFree flag", () => {
		expect(isFreeModel({ isFree: false })).toBe(false);
		expect(isFreeModel({ isFree: true })).toBe(true);
	});
});
