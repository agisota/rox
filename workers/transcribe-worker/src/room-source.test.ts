import { describe, expect, test } from "bun:test";

import {
	audioFrameToPcm16,
	buildWorkerJoinGrant,
	createLivekitRoomAudioSource,
	type LivekitAudioFrameLike,
	type LivekitRoomConnector,
	type LivekitRoomDriver,
	mintWorkerJoinToken,
	publishTranscriptFinal,
	type RoomAudioTrack,
	workerParticipantIdentity,
} from "./room-source";
import { TRANSCRIPT_DATA_TOPIC } from "./wire";

// ───────────────────────────── PCM frame adaptation ──────────────────────────

describe("audioFrameToPcm16", () => {
	test("copies the frame's PCM16 samples little-endian, byte-for-byte", () => {
		const samples = new Int16Array([0, 1, -1, 32767, -32768]);
		const frame: LivekitAudioFrameLike = {
			data: samples,
			sampleRate: 48000,
			channels: 1,
			samplesPerChannel: samples.length,
		};

		const bytes = audioFrameToPcm16(frame);

		expect(bytes.byteLength).toBe(samples.length * 2);
		// Re-read as Int16 (little-endian on every platform Bun targets) → same values.
		const roundTrip = new Int16Array(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength / 2,
		);
		expect(Array.from(roundTrip)).toEqual(Array.from(samples));
	});

	test("copies ONLY this frame's window of a shared backing buffer (no neighbour bleed)", () => {
		// LiveKit reuses one ArrayBuffer and hands out sub-views. Simulate frame #2
		// as a view over the MIDDLE of a larger buffer; the adapter must copy exactly
		// that window, never the whole buffer (the documented "noise" hazard).
		const backing = new Int16Array([11, 22, 33, 44, 55, 66, 77, 88]);
		const view = backing.subarray(2, 5); // [33, 44, 55]
		const frame: LivekitAudioFrameLike = {
			data: view,
			sampleRate: 48000,
			channels: 1,
			samplesPerChannel: view.length,
		};

		const bytes = audioFrameToPcm16(frame);
		const got = new Int16Array(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength / 2,
		);
		expect(Array.from(got)).toEqual([33, 44, 55]);
	});

	test("returns a detached copy — mutating the source frame after does not change it", () => {
		const samples = new Int16Array([5, 6, 7]);
		const frame: LivekitAudioFrameLike = {
			data: samples,
			sampleRate: 48000,
			channels: 1,
			samplesPerChannel: samples.length,
		};
		const bytes = audioFrameToPcm16(frame);
		// SDK recycles the buffer for the next frame — our copy must be immune.
		samples[0] = 999;
		const got = new Int16Array(bytes.buffer, bytes.byteOffset, 3);
		expect(got[0]).toBe(5);
	});
});

// ───────────────────────────── join-token mint ───────────────────────────────

/** Decode a JWT payload without verifying the signature (assert grant inputs). */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
	const part = jwt.split(".")[1];
	if (!part) throw new Error("not a JWT");
	const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
	const json = Buffer.from(b64, "base64").toString("utf8");
	return JSON.parse(json) as Record<string, unknown>;
}

describe("buildWorkerJoinGrant", () => {
	test("is subscribe + data only, scoped to the room, NEVER publishes media", () => {
		const grant = buildWorkerJoinGrant("org:o1:voice:c1");
		expect(grant).toEqual({
			room: "org:o1:voice:c1",
			roomJoin: true,
			canSubscribe: true,
			canPublishData: true,
			canPublish: false,
		});
	});
});

describe("workerParticipantIdentity", () => {
	test("derives a stable, room-scoped hidden identity", () => {
		expect(workerParticipantIdentity("org:o1:voice:c1")).toBe(
			"rox-transcribe-worker:org:o1:voice:c1",
		);
	});
});

describe("mintWorkerJoinToken", () => {
	test("mints a 3-part JWT whose video grant matches the hidden-subscriber grant", async () => {
		const jwt = await mintWorkerJoinToken({
			roomName: "org:o1:voice:c1",
			apiKey: "APIxxxxxxxx",
			apiSecret: "secret-value-never-logged",
		});

		expect(jwt.split(".")).toHaveLength(3);

		const payload = decodeJwtPayload(jwt);
		// Identity is the room-scoped worker identity, not a real user.
		expect(payload.sub).toBe("rox-transcribe-worker:org:o1:voice:c1");
		const video = payload.video as Record<string, unknown>;
		expect(video.room).toBe("org:o1:voice:c1");
		expect(video.roomJoin).toBe(true);
		expect(video.canSubscribe).toBe(true);
		expect(video.canPublishData).toBe(true);
		// canPublish absent/false → the worker cannot publish media (hidden listener).
		expect(video.canPublish ?? false).toBe(false);
	});

	test("different api keys/secrets produce different signatures (secret actually signs)", async () => {
		const a = await mintWorkerJoinToken({
			roomName: "org:o1:voice:c1",
			apiKey: "APIaaaa",
			apiSecret: "secret-A",
		});
		const b = await mintWorkerJoinToken({
			roomName: "org:o1:voice:c1",
			apiKey: "APIaaaa",
			apiSecret: "secret-B",
		});
		expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
	});
});

// ───────────────────────────── source over a fake driver ─────────────────────

/** A fake LiveKit driver: scripted tracks + a publishData spy, no native socket. */
function fakeDriver(tracks: RoomAudioTrack[]): {
	connector: LivekitRoomConnector;
	publishes: Array<{
		bytes: Uint8Array;
		opts: { reliable: boolean; topic: string };
	}>;
	connects: Array<{ roomName: string; url: string; token: string }>;
	closed: () => boolean;
} {
	const publishes: Array<{
		bytes: Uint8Array;
		opts: { reliable: boolean; topic: string };
	}> = [];
	const connects: Array<{ roomName: string; url: string; token: string }> = [];
	let isClosed = false;
	const driver: LivekitRoomDriver = {
		async *audioTracks() {
			for (const t of tracks) yield t;
		},
		async publishData(bytes, opts) {
			publishes.push({ bytes, opts });
		},
		async close() {
			isClosed = true;
		},
	};
	const connector: LivekitRoomConnector = async (opts) => {
		connects.push(opts);
		return driver;
	};
	return { connector, publishes, connects, closed: () => isClosed };
}

function audioTrack(identity: string, name: string): RoomAudioTrack {
	return {
		speaker: { identity, name },
		streamStartedAtMs: 1234,
		frames: (async function* () {
			yield new Uint8Array([1, 2]);
			yield new Uint8Array([3, 4]);
		})(),
	};
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const x of it) out.push(x);
	return out;
}

describe("createLivekitRoomAudioSource", () => {
	test("yields each driver audio track unchanged into the worker pipeline shape", async () => {
		const tA = audioTrack("a", "Alice");
		const tB = audioTrack("b", "Bob");
		const { connector } = fakeDriver([tA, tB]);

		const source = createLivekitRoomAudioSource({
			roomName: "org:o1:voice:c1",
			livekit: { apiKey: "k", apiSecret: "s", url: "wss://sfu.test" },
			connector,
		});

		expect(source.roomName).toBe("org:o1:voice:c1");
		const tracks = await collect(source.audioTracks());
		expect(tracks.map((t) => t.speaker.identity)).toEqual(["a", "b"]);
		expect(tracks[0]?.streamStartedAtMs).toBe(1234);

		// The frames are the exact PCM Uint8Array stream the worker pumps to Deepgram.
		const frames = await collect(
			tracks[0]?.frames as AsyncIterable<Uint8Array>,
		);
		expect(frames.map((f) => Array.from(f))).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	test("connects exactly once (lazily) with the minted token + configured url", async () => {
		const { connector, connects } = fakeDriver([audioTrack("a", "Alice")]);
		const source = createLivekitRoomAudioSource({
			roomName: "org:o1:voice:c1",
			livekit: { apiKey: "k", apiSecret: "s", url: "wss://sfu.test" },
			connector,
		});

		// No connect until the transport is actually used.
		expect(connects).toHaveLength(0);

		await collect(source.audioTracks());
		await source.publishData(new Uint8Array([9]), {
			reliable: true,
			topic: TRANSCRIPT_DATA_TOPIC,
		});

		// audioTracks() + publishData() share ONE connection.
		expect(connects).toHaveLength(1);
		expect(connects[0]?.roomName).toBe("org:o1:voice:c1");
		expect(connects[0]?.url).toBe("wss://sfu.test");
		// A real signed JWT was minted and handed to the driver.
		expect(connects[0]?.token.split(".")).toHaveLength(3);
	});

	test("publishTranscriptFinal forwards the EXACT reliable envelope through the source", async () => {
		const { connector, publishes } = fakeDriver([]);
		const source = createLivekitRoomAudioSource({
			roomName: "org:o1:voice:c1",
			livekit: { apiKey: "k", apiSecret: "s", url: "wss://sfu.test" },
			connector,
		});

		await publishTranscriptFinal(source, {
			id: "row-1",
			speakerIdentity: "a",
			speakerName: "Alice",
			text: "привет",
			language: "ru",
			capturedAt: 1000,
		});

		expect(publishes).toHaveLength(1);
		expect(publishes[0]?.opts).toEqual({
			reliable: true,
			topic: TRANSCRIPT_DATA_TOPIC,
		});
		const decoded = JSON.parse(
			new TextDecoder().decode(publishes[0]?.bytes),
		) as Record<string, unknown>;
		expect(decoded.text).toBe("привет");
		expect(decoded.id).toBe("row-1");
	});

	test("close() before any use is a no-op (never forces a connect just to close)", async () => {
		const { connector, connects, closed } = fakeDriver([]);
		const source = createLivekitRoomAudioSource({
			roomName: "org:o1:voice:c1",
			livekit: { apiKey: "k", apiSecret: "s", url: "wss://sfu.test" },
			connector,
		});

		await source.close();
		expect(connects).toHaveLength(0);
		expect(closed()).toBe(false);
	});

	test("close() after use disconnects the underlying driver", async () => {
		const { connector, closed } = fakeDriver([audioTrack("a", "Alice")]);
		const source = createLivekitRoomAudioSource({
			roomName: "org:o1:voice:c1",
			livekit: { apiKey: "k", apiSecret: "s", url: "wss://sfu.test" },
			connector,
		});

		await collect(source.audioTracks());
		await source.close();
		expect(closed()).toBe(true);
	});
});
