/**
 * Encode an audio Blob to a base64 string (no data-URL prefix) for sending to
 * the voice.transcribe tRPC procedure. Chunked to avoid call-stack limits on
 * large buffers.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}
