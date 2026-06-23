// Test preload: register happy-dom's DOM globals BEFORE any test module (and its
// transitive `@testing-library/dom`, which binds `screen` to `document.body` at
// import time) is evaluated. Bun loads `preload` modules ahead of test files, so
// `document`/`window` exist by the time React render tests mount. Scoped to the
// `@rox/web` package via its `bunfig.toml`.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") {
	GlobalRegistrator.register();
}
