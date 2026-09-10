// Structured JSON logging. Cloud Run / Cloud Logging parse single-line JSON
// written to stdout automatically (severity, message, jsonPayload fields),
// so no logging SDK is required for the demo.

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

function emit(severity: Severity, message: string, payload?: Record<string, unknown>) {
  const entry = {
    severity,
    message,
    time: new Date().toISOString(),
    ...(payload ? { jsonPayload: payload } : {}),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export const logger = {
  info: (message: string, payload?: Record<string, unknown>) => emit('INFO', message, payload),
  warn: (message: string, payload?: Record<string, unknown>) => emit('WARNING', message, payload),
  error: (message: string, payload?: Record<string, unknown>) => emit('ERROR', message, payload),
  debug: (message: string, payload?: Record<string, unknown>) => emit('DEBUG', message, payload),
};
