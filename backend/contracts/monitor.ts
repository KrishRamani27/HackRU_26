/** GET /monitor/summary. Send X-API-Key if configured. Ratios are 0..1. */
export type AIStatus = "ok" | "timeout" | "quota" | "invalid" | "error";
export interface MonitorSummary {
  backend: "sqlite" | "timescaledb";
  generated_at: string;
  current_prompt_version: string;
  source_counts: Partial<Record<"live" | "historical" | "mock", number>>;
  latency_10m: {
    bucket: string;
    route: string;
    call_count: number;
    timed_calls: number;
    avg_response_time_ms: number | null;
  }[];
  accuracy_by_prompt_version: {
    prompt_version: string;
    call_count: number;
    scored_calls: number;
    categorical_correct: number;
    categorical_total: number;
    accuracy: number | null;
  }[];
  failures_hourly: {
    bucket: string;
    call_count: number;
    failure_count: number;
    by_status: Partial<Record<AIStatus, number>>;
    failure_rate: number;
    status_rates: Partial<Record<AIStatus, number>>;
  }[];
  most_missed_fields: {
    field: string;
    misses: number;
    total: number;
    miss_rate: number;
  }[];
}
