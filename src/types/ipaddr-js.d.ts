declare module "ipaddr.js" {
  export class IPv4 {
    static isValid(input: string): boolean;
    static isValidFourPartDecimal(input: string): boolean;
    static parse(input: string): IPv4;
    range(): string;
    match(range: [IPv4, number]): boolean;
    toString(): string;
  }

  export class IPv6 {
    static isValid(input: string): boolean;
    static parse(input: string): IPv6;
    range(): string;
    match(range: [IPv6, number]): boolean;
    toString(): string;
    isIPv4MappedAddress(): boolean;
    toIPv4Address(): IPv4;
    parts: number[];
  }

  export type IPAddress = IPv4 | IPv6;

  export function isValid(input: string): boolean;
  export function parse(input: string): IPAddress;
  export function parseCIDR(input: string): [IPAddress, number];

  const ipaddr: {
    IPv4: typeof IPv4;
    IPv6: typeof IPv6;
    isValid: typeof isValid;
    parse: typeof parse;
    parseCIDR: typeof parseCIDR;
  };

  export default ipaddr;
}
