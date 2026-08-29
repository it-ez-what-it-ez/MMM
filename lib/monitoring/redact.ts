type SentryEvent = {
  user?: Record<string, unknown>;
  request?: Record<string, unknown>;
  breadcrumbs?: Array<Record<string, unknown>>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  [key: string]: unknown;
};

function safeUrl(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split("?")[0];
  }
}

/**
 * Provider credentials, campaign copy, recipient identities, and request bodies
 * never leave GrowthOS through monitoring events.
 */
export function redactMonitoringEvent<T extends object>(event: T): T {
  const mutable = event as SentryEvent;
  if (mutable.user) {
    mutable.user = mutable.user.id ? { id: mutable.user.id } : undefined;
  }
  if (mutable.request) {
    mutable.request = {
      method: mutable.request.method,
      url: safeUrl(mutable.request.url),
    };
  }
  if (mutable.breadcrumbs) {
    mutable.breadcrumbs = mutable.breadcrumbs.map((breadcrumb) => ({
      category: breadcrumb.category,
      level: breadcrumb.level,
      message: breadcrumb.message,
      timestamp: breadcrumb.timestamp,
    }));
  }
  delete mutable.extra;
  if (mutable.contexts) {
    const safeContexts: Record<string, unknown> = {};
    for (const key of ["runtime", "trace", "response"]) {
      if (mutable.contexts[key]) safeContexts[key] = mutable.contexts[key];
    }
    mutable.contexts = safeContexts;
  }
  return event;
}
