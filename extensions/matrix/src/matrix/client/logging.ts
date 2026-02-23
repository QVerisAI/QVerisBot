let matrixSdkLoggingConfigured = false;
let matrixSdkLoggingPromise: Promise<void> | null = null;

function shouldSuppressMatrixHttpNotFound(module: string, messageOrObject: unknown[]): boolean {
  if (module !== "MatrixHttpClient") {
    return false;
  }
  return messageOrObject.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (entry as { errcode?: string }).errcode === "M_NOT_FOUND";
  });
}

export async function ensureMatrixSdkLoggingConfigured(): Promise<void> {
  if (matrixSdkLoggingConfigured) {
    return;
  }
  if (matrixSdkLoggingPromise) {
    await matrixSdkLoggingPromise;
    return;
  }
  matrixSdkLoggingPromise = (async () => {
    try {
      const { ConsoleLogger, LogService } = await import("@vector-im/matrix-bot-sdk");
      const matrixSdkBaseLogger = new ConsoleLogger();
      LogService.setLogger({
        trace: (module, ...messageOrObject) =>
          matrixSdkBaseLogger.trace(module, ...messageOrObject),
        debug: (module, ...messageOrObject) =>
          matrixSdkBaseLogger.debug(module, ...messageOrObject),
        info: (module, ...messageOrObject) => matrixSdkBaseLogger.info(module, ...messageOrObject),
        warn: (module, ...messageOrObject) => matrixSdkBaseLogger.warn(module, ...messageOrObject),
        error: (module, ...messageOrObject) => {
          if (shouldSuppressMatrixHttpNotFound(module, messageOrObject)) {
            return;
          }
          matrixSdkBaseLogger.error(module, ...messageOrObject);
        },
      });
    } catch {
      // Matrix SDK logging is optional in environments without native crypto deps.
    } finally {
      matrixSdkLoggingConfigured = true;
      matrixSdkLoggingPromise = null;
    }
  })();
  await matrixSdkLoggingPromise;
}
