import { vi } from "vitest";
import * as ssrf from "../infra/net/ssrf.js";

/** Mocks SSRF resolution for tests that need public-hostname DNS to succeed. */
export function mockPinnedHostnameWithPolicyResolution(
  addresses: string[] = ["93.184.216.34"],
): ReturnType<typeof vi.spyOn> {
  const original = ssrf.resolvePinnedHostnameWithPolicy;
  return vi
    .spyOn(ssrf, "resolvePinnedHostnameWithPolicy")
    .mockImplementation(async (hostname, params) => {
      const lookupMock = vi
        .fn()
        .mockResolvedValue(addresses.map((a) => ({ address: a, family: a.includes(":") ? 6 : 4 })));
      return original(hostname, { ...params, lookupFn: lookupMock });
    });
}
