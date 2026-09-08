// Minimal IPv4 CIDR matcher - no external dependency needed for this scope.
// Used for optional defense-in-depth network allowlisting; see docs/SECURITY.md
// for why real enforcement should live at the firewall/VPC/Cloudflare layer.

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = ip.replace("::ffff:", "");
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr ?? 32);

  const ipInt = ipToInt(normalizedIp);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  if (bits === 0) return true;
  const mask = ~(2 ** (32 - bits) - 1);
  return (ipInt & mask) === (rangeInt & mask);
}

export function isIpAllowed(ip: string, allowedCidrs: string[]): boolean {
  if (allowedCidrs.length === 0) return true; // allowlist disabled
  return allowedCidrs.some((cidr) => isIpInCidr(ip, cidr));
}
