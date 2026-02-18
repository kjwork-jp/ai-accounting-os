/**
 * Structured metrics emission for stdout (ACA Logs / container logging).
 * All metrics are emitted as JSON lines to stdout.
 */

export const SLO = {
  OCR_JOB_LATENCY_P95_MS: 120_000,
  OCR_SUCCESS_RATE_DAILY: 0.95,
  QUEUE_DEPTH_HEAVY_MAX: 50,
} as const;

export const METRIC = {
  OCR_JOB_LATENCY_MS: 'ocr_job_latency_ms',
  OCR_JOB_SUCCESS: 'ocr_job_success',
  OCR_JOB_FAILURE: 'ocr_job_failure',
  OCR_RETRY_COUNT: 'ocr_retry_count',
  CLASSIFICATION_METHOD: 'classification_method',
  DUPLICATE_CHECK_COUNT: 'duplicate_check_count',
} as const;

/**
 * Emit a generic metric as a JSON line to stdout.
 */
export function emitMetric(
  metric: string,
  value: number,
  labels?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      metric,
      value,
      labels: labels ?? {},
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Emit an OCR job latency metric with automatic SLO breach detection.
 */
export function emitLatency(
  latencyMs: number,
  labels?: Record<string, unknown>,
): void {
  const sloBreach = latencyMs > SLO.OCR_JOB_LATENCY_P95_MS;
  emitMetric(METRIC.OCR_JOB_LATENCY_MS, latencyMs, {
    ...labels,
    slo_breach: sloBreach,
  });
}
