self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!_next|ingest|favicon.ico|[^?]*\\.(?:css|js|png|jpe?g|webp|svg|gif|ico|ttf|woff2?|webmanifest|xml|txt)).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!_next|ingest|favicon.ico|[^?]*\\.(?:css|js|png|jpe?g|webp|svg|gif|ico|ttf|woff2?|webmanifest|xml|txt)).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()