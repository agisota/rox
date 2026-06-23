// Voice dictation core now lives in the shared @rox/ui package so web/desktop
// (and a future mobile adapter) share one implementation. This thin re-export
// keeps the existing `renderer/lib/voice/useDictation` import path working.
export {
	type DictationState,
	type Recording,
	type UseDictation,
	type UseDictationOptions,
	useDictation,
} from "@rox/ui/voice";
