// Commit-reveal entropy combination. Each player generates a random 32-byte
// secret, publishes its SHA-256 commitment, and (after all commitments are in)
// publishes the secret. The collective entropy is the XOR of all secrets,
// which any one player can grind only if they break SHA-256.

export function randomSeedHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function commitSeed(seedHex: string): Promise<string> {
  const seed = hexToBytes(seedHex);
  const digest = await crypto.subtle.digest("SHA-256", seed.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyCommit(seedHex: string, commitmentHex: string): Promise<boolean> {
  return (await commitSeed(seedHex)) === commitmentHex;
}

/** Combine many revealed seeds into one entropy value via XOR. */
export function combineSeeds(seedHexes: string[]): Uint8Array {
  const out = new Uint8Array(32);
  for (const hex of seedHexes) {
    const bytes = hexToBytes(hex);
    for (let i = 0; i < 32; i++) {
      out[i] = (out[i] ?? 0) ^ (bytes[i] ?? 0);
    }
  }
  return out;
}

/** Deterministic Fisher-Yates shuffle seeded by `entropy`. */
export async function seededShuffle<T>(items: T[], entropy: Uint8Array): Promise<T[]> {
  const out = items.slice();
  // Generate enough pseudo-random bytes by repeated SHA-256 hashing.
  const stream: number[] = [];
  let counter = 0;
  while (stream.length < out.length * 4) {
    const buf = new Uint8Array(entropy.length + 4);
    buf.set(entropy, 0);
    new DataView(buf.buffer).setUint32(entropy.length, counter, false);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf.buffer as ArrayBuffer));
    for (const b of h) stream.push(b);
    counter++;
  }
  for (let i = out.length - 1; i > 0; i--) {
    const r =
      ((stream[i * 4] ?? 0) << 24) |
      ((stream[i * 4 + 1] ?? 0) << 16) |
      ((stream[i * 4 + 2] ?? 0) << 8) |
      (stream[i * 4 + 3] ?? 0);
    const j = Math.abs(r) % (i + 1);
    const tmp = out[i];
    out[i] = out[j] as T;
    out[j] = tmp as T;
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const v of b) s += v.toString(16).padStart(2, "0");
  return s;
}
function hexToBytes(h: string): Uint8Array {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}
