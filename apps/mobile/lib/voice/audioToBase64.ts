import { File } from "expo-file-system";

/**
 * Read a recorded audio file (a `file://` URI from expo-audio) as bare base64.
 *
 * RN has no `Blob`/`btoa`, so the desktop `blobToBase64` cannot be reused. The
 * new expo-file-system File API exposes `base64()` which returns the file
 * contents as a base64 string with no `data:` prefix — the exact shape the
 * `voice.transcribe` tRPC input (`audioBase64`) expects.
 */
export async function audioToBase64(fileUri: string): Promise<string> {
	return new File(fileUri).base64();
}
