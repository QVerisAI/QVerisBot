import { vi } from "vitest";
import * as ssrf from "../infra/net/ssrf.js";
import type { LookupFn } from "../infra/net/ssrf.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

export function mockPinnedHostnameResolution(addresses: string[] = ["93.184.216.34"]) {
  const resolvePinnedHostname = ssrf.resolvePinnedHostname;
  const resolvePinnedHostnameWithPolicy = ssrf.resolvePinnedHostnameWithPolicy;
  const lookupFn = (async (hostname: string, options?: { all?: boolean }) => {
    const normalized = normalizeLowercaseStringOrEmpty(hostname).replace(/\.$/, "");
    const resolved = addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
      hostname: normalized,
    }));
    return options?.all === true ? resolved : resolved[0];
  }) as LookupFn;
  const pinned = vi
    .spyOn(ssrf, "resolvePinnedHostname")
    .mockImplementation((hostname) => resolvePinnedHostname(hostname, lookupFn));
  const pinnedWithPolicy = vi
    .spyOn(ssrf, "resolvePinnedHostnameWithPolicy")
    .mockImplementation((hostname, params) =>
      resolvePinnedHostnameWithPolicy(hostname, { ...params, lookupFn }),
    );
  return {
    mockRestore: () => {
      pinned.mockRestore();
      pinnedWithPolicy.mockRestore();
    },
  };
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
