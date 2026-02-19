import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitMetric, emitLatency, SLO, METRIC } from '../../worker/src/lib/metrics';

describe('metrics', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('emitMetric outputs valid JSON', () => {
    emitMetric('test_metric', 42, { foo: 'bar' });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output).toBeDefined();
  });

  it('emitMetric output contains metric, value, labels, timestamp', () => {
    emitMetric('test_metric', 100, { key: 'val' });
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.metric).toBe('test_metric');
    expect(output.value).toBe(100);
    expect(output.labels).toEqual({ key: 'val' });
    expect(output.timestamp).toBeDefined();
  });

  it('emitMetric defaults labels to empty object', () => {
    emitMetric('test_metric', 1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.labels).toEqual({});
  });

  it('emitLatency emits ocr_job_latency_ms metric', () => {
    emitLatency(5000, { documentId: 'doc-1' });
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.metric).toBe(METRIC.OCR_JOB_LATENCY_MS);
    expect(output.value).toBe(5000);
  });

  it('emitLatency sets slo_breach=true when exceeding threshold', () => {
    emitLatency(130_000, { documentId: 'doc-1' });
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.labels.slo_breach).toBe(true);
  });

  it('emitLatency sets slo_breach=false when within threshold', () => {
    emitLatency(5000, { documentId: 'doc-1' });
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.labels.slo_breach).toBe(false);
  });

  it('SLO constants have correct values', () => {
    expect(SLO.OCR_JOB_LATENCY_P95_MS).toBe(120_000);
    expect(SLO.OCR_SUCCESS_RATE_DAILY).toBe(0.95);
    expect(SLO.QUEUE_DEPTH_HEAVY_MAX).toBe(50);
  });
});
