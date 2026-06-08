import { db } from "@rox/db/client";
import { members, organizations, subscriptions } from "@rox/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@rox/shared/billing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

// Stripe has been removed in favour of the Rox economy model: every feature is
// unlocked by default for all users (free), and prepaid usage is metered through
// the economy tables. The `subscriptions` row is retained only as a
// subscriber/free status flag (perks may differ later). These procedures keep
// their original shapes so existing clients continue to type-check, but they no
// longer talk to an external payment processor.

type BillingAddress = {
	line1: string | null;
	line2: string | null;
	city: string | null;
	state: string | null;
	postalCode: string | null;
	country: string | null;
};

type BillingPaymentMethod = {
	type: string;
	brand: string;
	last4: string | null;
};

type BillingTaxId = {
	type: string;
	value: string;
};

type BillingInvoice = {
	id: string;
	date: number;
	amount: number;
	currency: string;
	hostedInvoiceUrl: string | null;
};

type BillingDetailsResult = {
	name: string | null;
	email: string | null;
	address: BillingAddress | null;
	paymentMethod: BillingPaymentMethod | null;
	taxId: BillingTaxId | null;
};

async function requireOwner(ctx: {
	session: { user: { id: string } };
	activeOrganizationId: string | null;
}) {
	const activeOrgId = ctx.activeOrganizationId;
	if (!activeOrgId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No active organization",
		});
	}

	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, ctx.session.user.id),
			eq(members.organizationId, activeOrgId),
		),
	});

	if (!member || member.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only owners can manage billing",
		});
	}

	return activeOrgId;
}

export const billingRouter = {
	activePlan: protectedProcedure.query(async ({ ctx }) => {
		const activeOrgId = ctx.activeOrganizationId;
		if (!activeOrgId) return { plan: "free" as const, status: null };

		const subscription = await db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, activeOrgId),
				inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			),
			orderBy: desc(subscriptions.createdAt),
		});

		if (!subscription) {
			return { plan: "free" as const, status: null };
		}

		return { plan: subscription.plan, status: subscription.status };
	}),

	invoices: protectedProcedure.query(async () => {
		// Invoicing is handled by the Rox economy (top-ups / usage), not an
		// external processor. No hosted invoices to surface.
		const invoices: BillingInvoice[] = [];
		return invoices;
	}),

	details: protectedProcedure.query(
		async ({ ctx }): Promise<BillingDetailsResult> => {
			const activeOrgId = await requireOwner(ctx);

			const org = await db.query.organizations.findFirst({
				where: eq(organizations.id, activeOrgId),
				columns: { name: true },
			});

			// No external billing profile is collected under the Rox economy model.
			return {
				name: org?.name ?? null,
				email: null,
				address: null,
				paymentMethod: null,
				taxId: null,
			};
		},
	),

	portal: protectedProcedure
		.input(
			z.object({
				flowType: z
					.enum(["payment_method_update", "general"])
					.optional()
					.default("general"),
			}),
		)
		.mutation(async ({ ctx }) => {
			await requireOwner(ctx);
			// No external billing portal under the Rox economy model.
			return { url: null as string | null };
		}),
} satisfies TRPCRouterRecord;
