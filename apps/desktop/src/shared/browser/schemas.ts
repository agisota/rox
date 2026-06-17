import { z } from "zod";

/** Point in CSS pixels relative to the webview, used to hit-test an element. */
export const clientPointSchema = z.object({
	x: z.number(),
	y: z.number(),
});

export const setDesignModeInputSchema = z.object({
	paneId: z.string(),
	enabled: z.boolean(),
});

export const setDevicePresetInputSchema = z
	.object({
		paneId: z.string(),
		presetId: z.string(),
		custom: z
			.object({
				width: z.number(),
				height: z.number(),
				deviceScaleFactor: z.number().optional(),
				isMobile: z.boolean().optional(),
				hasTouch: z.boolean().optional(),
				userAgent: z.string().optional(),
			})
			.optional(),
	})
	.refine((input) => input.presetId !== "custom" || input.custom != null, {
		path: ["custom"],
		message: "`custom` dimensions are required when presetId is 'custom'",
	})
	.refine((input) => input.presetId === "custom" || input.custom == null, {
		path: ["custom"],
		message: "`custom` dimensions are only accepted when presetId is 'custom'",
	});

export const captureElementInputSchema = z.object({
	paneId: z.string(),
	workspaceId: z.string(),
	/** Absolute workspace root, used to scope screenshot temp files + source maps. */
	workspaceRoot: z.string().optional(),
	devicePresetId: z.string().optional(),
	clientPoint: clientPointSchema.optional(),
	selectorHint: z.string().optional(),
});

export const getCaptureInputSchema = z.object({ captureId: z.string() });

/**
 * Runtime schema for the descriptor returned by the in-page serialization
 * script. Guest output is untrusted, so we validate its shape before use.
 */
export const rawElementDescriptorSchema = z.object({
	tagName: z.string(),
	id: z.string().optional(),
	classList: z.array(z.string()),
	attributes: z.record(z.string(), z.string()),
	testId: z.string().optional(),
	role: z.string().optional(),
	ariaLabel: z.string().optional(),
	outerHTML: z.string(),
	parentOuterHTML: z.string().optional(),
	nearbyText: z.string().optional(),
	textSnippet: z.string().optional(),
	computedStyles: z.record(z.string(), z.string()),
	rect: z.object({
		x: z.number(),
		y: z.number(),
		width: z.number(),
		height: z.number(),
	}),
	viewport: z.object({
		width: z.number(),
		height: z.number(),
		devicePixelRatio: z.number(),
	}),
	domPath: z.array(z.object({ tagName: z.string(), index: z.number() })),
	sourceHint: z
		.object({
			filePath: z.string().optional(),
			line: z.number().optional(),
			column: z.number().optional(),
			framework: z.enum(["react", "vue", "svelte", "unknown"]).optional(),
		})
		.optional(),
});

export type SetDesignModeInput = z.infer<typeof setDesignModeInputSchema>;
export type SetDevicePresetInput = z.infer<typeof setDevicePresetInputSchema>;
export type CaptureElementInput = z.infer<typeof captureElementInputSchema>;
