import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "./kv";

// 10 invitations per hour per user
export const invitationRateLimit = new Ratelimit({
	redis: kv,
	limiter: Ratelimit.slidingWindow(10, "1 h"),
	prefix: "ratelimit:invitation",
});
