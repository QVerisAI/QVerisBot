import { vi } from "vitest";
import * as ssrf from "../infra/net/ssrf.js";

export function mockPinnedHostnameResolution(addresses: string[] = ["93.184.216.34"]) {
  return vi.spyOn(ssrf, "resolvePinnedHostname").mockImplementation(async (hostname) => {
    const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
    const pinnedAddresses = [...addresses];
    return {
      hostname: normalized,
      addresses: pinnedAddresses,
      lookup: ssrf.createPinnedLookup({ hostname: normalized, addresses: pinnedAddresses }),
    };
  });
}

/** Mocks SSRF resolution for tests that need public-hostname DNS to succeed (e.g. example.com). */
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
