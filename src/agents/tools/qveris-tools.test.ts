import { describe, expect, it } from "vitest";
import { classifyQverisError } from "./qveris-tools.js";

describe("classifyQverisError", () => {
  it("classifies AbortError (DOMException) as timeout", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    const result = classifyQverisError(err);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("timeout");
    expect(result.detail).toContain("timed out");
    expect(result.retry_hint).toBeDefined();
  });

  it("classifies plain Error with name AbortError as timeout", () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    const result = classifyQverisError(err);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("timeout");
  });

  it("classifies HTTP 4xx errors correctly", () => {
    const err = new Error("QVeris execute failed (422): unprocessable entity");
    const result = classifyQverisError(err);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("http_error");
    expect(result.status).toBe(422);
    expect(result.retry_hint).toContain("tool_id");
  });

  it("classifies HTTP 5xx errors correctly", () => {
    const err = new Error("QVeris search failed (503): service unavailable");
    const result = classifyQverisError(err);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("http_error");
    expect(result.status).toBe(503);
    expect(result.retry_hint).toContain("retry");
  });

  it("classifies network errors (plain Error)", () => {
    const err = new Error("fetch failed: ECONNREFUSED");
    const result = classifyQverisError(err);
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("network_error");
    expect(result.detail).toContain("ECONNREFUSED");
  });

  it("classifies unknown thrown values", () => {
    const result = classifyQverisError("something weird");
    expect(result.success).toBe(false);
    expect(result.error_type).toBe("network_error");
    expect(result.detail).toBe("something weird");
  });
});
