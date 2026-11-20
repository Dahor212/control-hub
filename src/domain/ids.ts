/** Identifikátory. GUID odpovídá GUID() v Power Fx; kódy jsou lidsky čitelné a unikátní. */

export function newGuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback (testy ve starších prostředích)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nextSequenceCode(prefix: string, existing: string[], width = 4): string {
  const re = new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)$`);
  const max = existing.reduce((acc, code) => {
    const m = re.exec(code);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

export function nextControlCode(existing: string[]): string {
  return nextSequenceCode('CTRL-', existing, 4);
}

export function nextFindingCode(existing: string[], year: number): string {
  return nextSequenceCode(`FND-${year}-`, existing, 4);
}

export function protocolIdFor(controlCode: string, runCode: string, version: number): string {
  return `PRT-${controlCode}-${runCode}-V${version}`;
}

/** Kanonický JSON (seřazené klíče) – základ pro hash snapshotu. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministický generátor pseudonáhodných čísel (demo data). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}
