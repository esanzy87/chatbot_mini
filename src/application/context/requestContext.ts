export type RequestContext = {
  requestId: string;
  sessionId?: string;
  turnId?: string;
  debug: boolean;
};

export function createRequestContext(params: {
  requestId: string;
  sessionId?: string;
  turnId?: string;
  debug?: boolean;
}): RequestContext {
  return {
    requestId: params.requestId,
    debug: params.debug ?? false,
    ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
    ...(params.turnId !== undefined ? { turnId: params.turnId } : {})
  };
}
