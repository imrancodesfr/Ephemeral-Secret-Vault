import crypto from "crypto";

const PRIME = 2147483647n;
const HEX_PER_CHUNK = 7;

function modPow(base, exp, mod) {
  base = ((BigInt(base) % mod) + mod) % mod;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error("Modular inverse does not exist");
  return ((old_s % m) + m) % m;
}

function lagrangeInterpolate(shares, prime) {
  let val = 0n;
  for (let i = 0; i < shares.length; i++) {
    let num = 1n;
    let den = 1n;
    for (let j = 0; j < shares.length; j++) {
      if (i === j) continue;
      num = (num * (prime - BigInt(shares[j].x))) % prime;
      den = (den * (BigInt(shares[i].x) - BigInt(shares[j].x) + prime)) % prime;
    }
    val = (val + BigInt(shares[i].y) * num % prime * modInverse(den, prime)) % prime;
  }
  return val;
}

class ShamirService {
  split(secret, totalShares, requiredShares) {
    const hex = Buffer.from(secret, "utf8").toString("hex");

    const chunks = [];
    const chunkLengths = [];
    for (let i = 0; i < hex.length; i += HEX_PER_CHUNK) {
      const slice = hex.slice(i, i + HEX_PER_CHUNK);
      chunkLengths.push(slice.length);
      chunks.push(BigInt(parseInt(slice, 16)));
    }

    const polynomials = chunks.map((val) => {
      const coeffs = [val];
      for (let i = 1; i < requiredShares; i++) {
        coeffs.push(BigInt(crypto.randomInt(1, Number(PRIME))));
      }
      return coeffs;
    });

    const shares = [];
    for (let x = 1; x <= totalShares; x++) {
      const yValues = polynomials.map((coeffs) => {
        let y = 0n;
        for (let i = 0; i < coeffs.length; i++) {
          y = (y + coeffs[i] * modPow(BigInt(x), BigInt(i), PRIME)) % PRIME;
        }
        return Number(y);
      });
      shares.push({ x, y: yValues });
    }

    return { shares, threshold: requiredShares, prime: Number(PRIME), chunkLengths };
  }

  reconstruct(shares, prime, chunkLengths) {
    if (!shares || shares.length < 2) {
      throw new Error("Need at least 2 shares to reconstruct");
    }

    const p = BigInt(prime);
    const chunkCount = chunkLengths.length;
    const hexChunks = [];

    for (let c = 0; c < chunkCount; c++) {
      const chunkShares = shares.map((s) => ({ x: s.x, y: s.y[c] }));
      const val = lagrangeInterpolate(chunkShares, p);
      hexChunks.push(Number(val).toString(16).padStart(chunkLengths[c], "0"));
    }

    return Buffer.from(hexChunks.join(""), "hex").toString("utf8");
  }
}

export default new ShamirService();
