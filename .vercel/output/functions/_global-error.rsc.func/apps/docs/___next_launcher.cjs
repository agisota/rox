"use strict";

// src/vercel-request-context.ts
var SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
function getContext() {
  const fromSymbol = globalThis;
  return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}

// src/next-request-context.ts
var import_async_hooks = require("async_hooks");
var name = "@next/request-context";
var NEXT_REQUEST_CONTEXT_SYMBOL = Symbol.for(name);
var INTERNAL_STORAGE_FIELD_SYMBOL = Symbol.for("internal.storage");
function getOrCreateContextSingleton() {
  const _globalThis = globalThis;
  if (!_globalThis[NEXT_REQUEST_CONTEXT_SYMBOL]) {
    const storage = new import_async_hooks.AsyncLocalStorage();
    const Context = {
      get: () => storage.getStore(),
      [INTERNAL_STORAGE_FIELD_SYMBOL]: storage
    };
    _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL] = Context;
  }
  return _globalThis[NEXT_REQUEST_CONTEXT_SYMBOL];
}
var NextRequestContext = getOrCreateContextSingleton();
function withNextRequestContext(value, callback) {
  const storage = NextRequestContext[INTERNAL_STORAGE_FIELD_SYMBOL];
  return storage.run(value, callback);
}

// src/server-launcher.ts
process.chdir(__dirname);
var region = process.env.VERCEL_REGION || process.env.NOW_REGION;
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = region === "dev1" ? "development" : "production";
}
if (process.env.NODE_ENV !== "production" && region !== "dev1") {
  console.warn(
    `Warning: NODE_ENV was incorrectly set to "${process.env.NODE_ENV}", this value is being overridden to "production"`
  );
  process.env.NODE_ENV = "production";
}
process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = "next"
var NextServer = require("next/dist/server/next-server.js").default;
// @preserve next-server-preload-target
const conf = {"env":{"_sentryRewriteFramesDistDir":".next","_sentryRewriteFramesAssetPrefixPath":"","_sentryRewritesTunnelPath":"/monitoring","_sentryRelease":"573d707e06d53647ea0a8994067dccea2bf93374"},"typescript":{"ignoreBuildErrors":false},"typedRoutes":false,"distDir":".next","cleanDistDir":true,"assetPrefix":"","cacheMaxMemorySize":52428800,"configOrigin":"next.config.mjs","useFileSystemPublicRoutes":true,"generateEtags":true,"pageExtensions":["mdx","md","jsx","js","tsx","ts"],"poweredByHeader":true,"compress":false,"images":{"deviceSizes":[640,750,828,1080,1200,1920,2048,3840],"imageSizes":[32,48,64,96,128,256,384],"path":"/_next/image","loader":"default","loaderFile":"","domains":[],"disableStaticImages":false,"minimumCacheTTL":14400,"formats":["image/webp"],"maximumRedirects":3,"maximumResponseBody":50000000,"dangerouslyAllowLocalIP":false,"dangerouslyAllowSVG":false,"contentSecurityPolicy":"script-src 'none'; frame-src 'none'; sandbox;","contentDispositionType":"attachment","localPatterns":[{"pathname":"**","search":""}],"remotePatterns":[{"protocol":"https","hostname":"*.public.blob.vercel-storage.com"}],"qualities":[75],"unoptimized":false,"customCacheHandler":false},"devIndicators":{"position":"bottom-left"},"onDemandEntries":{"maxInactiveAge":60000,"pagesBufferLength":5},"basePath":"","sassOptions":{},"trailingSlash":false,"i18n":null,"productionBrowserSourceMaps":true,"excludeDefaultMomentLocales":true,"reactProductionProfiling":false,"reactStrictMode":true,"reactMaxHeadersLength":6000,"httpAgentOptions":{"keepAlive":true},"logging":{"serverFunctions":true,"browserToTerminal":"warn"},"compiler":{},"expireTime":31536000,"staticPageGenerationTimeout":60,"modularizeImports":{"@mui/icons-material":{"transform":"@mui/icons-material/{{member}}"},"lodash":{"transform":"lodash/{{member}}"}},"outputFileTracingRoot":"/tmp/rox-fix","cacheComponents":false,"cacheLife":{"default":{"stale":300,"revalidate":900,"expire":4294967294},"seconds":{"stale":30,"revalidate":1,"expire":60},"minutes":{"stale":300,"revalidate":60,"expire":3600},"hours":{"stale":300,"revalidate":3600,"expire":86400},"days":{"stale":300,"revalidate":86400,"expire":604800},"weeks":{"stale":300,"revalidate":604800,"expire":2592000},"max":{"stale":300,"revalidate":2592000,"expire":31536000}},"cacheHandlers":{},"experimental":{"appNewScrollHandler":false,"useSkewCookie":false,"cssChunking":true,"multiZoneDraftMode":false,"appNavFailHandling":false,"prerenderEarlyExit":true,"serverMinification":true,"linkNoTouchStart":false,"caseSensitiveRoutes":false,"cachedNavigations":false,"partialFallbacks":false,"dynamicOnHover":false,"varyParams":false,"prefetchInlining":false,"preloadEntriesOnStart":true,"clientRouterFilter":true,"clientRouterFilterRedirects":false,"fetchCacheKeyPrefix":"","proxyPrefetch":"flexible","optimisticClientCache":true,"manualClientBasePath":false,"cpus":7,"memoryBasedWorkersCount":false,"imgOptConcurrency":null,"imgOptTimeoutInSeconds":7,"imgOptMaxInputPixels":268402689,"imgOptSequentialRead":null,"imgOptSkipMetadata":null,"isrFlushToDisk":true,"workerThreads":false,"optimizeCss":false,"nextScriptWorkers":false,"scrollRestoration":false,"externalDir":false,"disableOptimizedLoading":false,"gzipSize":true,"craCompat":false,"esmExternals":true,"fullySpecified":false,"swcTraceProfiling":false,"forceSwcTransforms":false,"largePageDataBytes":128000,"typedEnv":false,"clientTraceMetadata":["baggage","sentry-trace"],"parallelServerCompiles":false,"parallelServerBuildTraces":false,"ppr":false,"authInterrupts":false,"webpackMemoryOptimizations":false,"optimizeServerReact":true,"strictRouteTypes":false,"viewTransition":false,"removeUncaughtErrorAndRejectionListeners":false,"validateRSCRequestHeaders":false,"staleTimes":{"dynamic":0,"static":300},"reactDebugChannel":true,"serverComponentsHmrCache":true,"staticGenerationMaxConcurrency":8,"staticGenerationMinPagesPerWorker":25,"transitionIndicator":false,"gestureTransition":false,"inlineCss":false,"useCache":false,"globalNotFound":false,"browserDebugInfoInTerminal":"warn","lockDistDir":true,"proxyClientMaxBodySize":10485760,"hideLogsAfterAbort":false,"mcpServer":true,"turbopackFileSystemCacheForDev":true,"turbopackFileSystemCacheForBuild":false,"turbopackInferModuleSideEffects":true,"turbopackPluginRuntimeStrategy":"childProcesses","trustHostHeader":true,"optimizePackageImports":["lucide-react","date-fns","lodash-es","ramda","antd","react-bootstrap","ahooks","@ant-design/icons","@headlessui/react","@headlessui-float/react","@heroicons/react/20/solid","@heroicons/react/24/solid","@heroicons/react/24/outline","@visx/visx","@tremor/react","rxjs","@mui/material","@mui/icons-material","recharts","react-use","effect","@effect/schema","@effect/platform","@effect/platform-node","@effect/platform-browser","@effect/platform-bun","@effect/sql","@effect/sql-mssql","@effect/sql-mysql2","@effect/sql-pg","@effect/sql-sqlite-node","@effect/sql-sqlite-bun","@effect/sql-sqlite-wasm","@effect/sql-sqlite-react-native","@effect/rpc","@effect/rpc-http","@effect/typeclass","@effect/experimental","@effect/opentelemetry","@material-ui/core","@material-ui/icons","@tabler/icons-react","mui-core","react-icons/ai","react-icons/bi","react-icons/bs","react-icons/cg","react-icons/ci","react-icons/di","react-icons/fa","react-icons/fa6","react-icons/fc","react-icons/fi","react-icons/gi","react-icons/go","react-icons/gr","react-icons/hi","react-icons/hi2","react-icons/im","react-icons/io","react-icons/io5","react-icons/lia","react-icons/lib","react-icons/lu","react-icons/md","react-icons/pi","react-icons/ri","react-icons/rx","react-icons/si","react-icons/sl","react-icons/tb","react-icons/tfi","react-icons/ti","react-icons/vsc","react-icons/wi"],"isExperimentalCompile":false},"htmlLimitedBots":"[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight","bundlePagesRouterDependencies":false,"configFileName":"next.config.mjs","skipTrailingSlashRedirect":true,"turbopack":{"rules":{"*.{md,mdx}":{"loaders":[{"loader":"fumadocs-mdx/loader-mdx","options":{"configPath":"source.config.ts","outDir":".source","absoluteCompiledConfigPath":"/tmp/rox-fix/apps/docs/.source/source.config.mjs","isDev":false}}],"as":"*.js"},"*.json":{"loaders":[{"loader":"fumadocs-mdx/loader-meta","options":{"configPath":"source.config.ts","outDir":".source","absoluteCompiledConfigPath":"/tmp/rox-fix/apps/docs/.source/source.config.mjs","isDev":false}}],"as":"*.json"},"*.yaml":{"loaders":[{"loader":"fumadocs-mdx/loader-meta","options":{"configPath":"source.config.ts","outDir":".source","absoluteCompiledConfigPath":"/tmp/rox-fix/apps/docs/.source/source.config.mjs","isDev":false}}],"as":"*.js"},"**/instrumentation-client.*":{"condition":{"not":"foreign"},"loaders":[{"loader":"/tmp/rox-fix/node_modules/.bun/@sentry+nextjs@10.46.0+2d6312e34123a19c/node_modules/@sentry/nextjs/build/cjs/config/loaders/valueInjectionLoader.js","options":{"values":{"_sentryRouteManifest":"{\"dynamicRoutes\":[{\"path\":\"/:slug*?\",\"regex\":\"^/(.*)$\",\"paramNames\":[\"slug\"],\"hasOptionalPrefix\":false}],\"staticRoutes\":[],\"isrRoutes\":[]}","_sentryNextJsVersion":"16.2.6","_sentryRewritesTunnelPath":"/monitoring"}}}]},"**/instrumentation.*":{"condition":{"not":"foreign"},"loaders":[{"loader":"/tmp/rox-fix/node_modules/.bun/@sentry+nextjs@10.46.0+2d6312e34123a19c/node_modules/@sentry/nextjs/build/cjs/config/loaders/valueInjectionLoader.js","options":{"values":{"__SENTRY_SERVER_MODULES__":{"@radix-ui/react-collapsible":"1.1.12","@radix-ui/react-scroll-area":"1.2.10","@sentry/nextjs":"10.46.0","@rox/shared":"workspace:*","@t3-oss/env-nextjs":"0.13.11","class-variance-authority":"0.7.1","dotenv":"17.3.1","framer-motion":"12.38.0","fumadocs-core":"16.4.7","fumadocs-mdx":"14.2.5","fumadocs-ui":"16.4.7","lucide-react":"0.563.0","next":"16.2.6","posthog-js":"1.310.1","react":"19.2.3","react-dom":"19.2.3","tailwind-merge":"3.5.0","zod":"4.3.6","@rox/typescript":"workspace:*","@tailwindcss/postcss":"4.2.2","@types/mdx":"2.0.13","@types/node":"24.12.0","@types/react":"19.2.14","@types/react-dom":"19.2.3","postcss":"8.5.10","tailwindcss":"4.2.2","tailwindcss-animate":"1.0.7","typescript":"5.9.3"},"_sentryNextJsVersion":"16.2.6","_sentryRewritesTunnelPath":"/monitoring"}}}]}},"debugIds":true,"root":"/tmp/rox-fix"},"serverExternalPackages":["amqplib","connect","dataloader","express","generic-pool","graphql","@hapi/hapi","ioredis","kafkajs","koa","lru-memoizer","mongodb","mongoose","mysql","mysql2","knex","pg","pg-pool","@node-redis/client","@redis/client","redis","tedious"],"distDirRoot":".next","_originalRedirects":[{"source":"/","destination":"/overview","permanent":false},{"source":"/docs","destination":"/overview","permanent":false}],"_originalRewrites":{"beforeFiles":[],"afterFiles":[{"source":"/monitoring(/?)","has":[{"type":"query","key":"o","value":"(?<orgid>\\d*)"},{"type":"query","key":"p","value":"(?<projectid>\\d*)"},{"type":"query","key":"r","value":"(?<region>[a-z]{2})"}],"destination":"https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0"},{"source":"/monitoring(/?)","has":[{"type":"query","key":"o","value":"(?<orgid>\\d*)"},{"type":"query","key":"p","value":"(?<projectid>\\d*)"}],"destination":"https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0"},{"source":"/:path*.mdx","destination":"/llms.mdx/:path*"},{"source":"/ingest/static/:path*","destination":"https://us-assets.i.posthog.com/static/:path*"},{"source":"/ingest/:path*","destination":"https://us.i.posthog.com/:path*"},{"source":"/ingest/decide","destination":"https://us.i.posthog.com/decide"}],"fallback":[]}};
var nextServer = new NextServer({
  conf,
  dir: ".",
  minimalMode: true,
  customServer: false
});
var serve = (handler) => async (req, res) => {
  const vercelContext = getContext();
  await withNextRequestContext({ waitUntil: vercelContext.waitUntil }, () => {
    // @preserve entryDirectory handler
    return handler(req, res);
  });
};
module.exports = serve(nextServer.getRequestHandler());
if ((conf.experimental?.ppr || conf.experimental?.cacheComponents) && "getRequestHandlerWithMetadata" in nextServer && typeof nextServer.getRequestHandlerWithMetadata === "function") {
  module.exports.getRequestHandlerWithMetadata = (metadata) => serve(nextServer.getRequestHandlerWithMetadata(metadata));
}
if (process.env.NEXT_PRIVATE_PRELOAD_ENTRIES) {
  module.exports.preload = nextServer.unstable_preloadEntries.bind(nextServer);
}
