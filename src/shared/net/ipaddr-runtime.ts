import { createRequire } from "node:module";
import type * as IpAddrModule from "ipaddr.js";

const require = createRequire(import.meta.url);

let ipaddrModule: typeof IpAddrModule | null = null;

export function loadIpAddrModule(): typeof IpAddrModule {
  ipaddrModule ??= require("ipaddr.js") as typeof IpAddrModule;
  return ipaddrModule;
}
