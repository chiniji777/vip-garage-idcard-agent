// Thin wrapper around `thai-id-card-reader`. The library is event-driven
// (it listens to PC/SC card-insert / card-remove), so we wrap it in a
// promise that resolves on the next successful read.

import type { Request, Response } from "express";

import { READER_TIMEOUT_MS } from "./config";

// Lazy import so a missing pcsclite native module doesn't crash the
// Electron main process — we want the HTTP server to start either way
// and surface a useful error on /read-id.
type SmartCardData = {
  citizenID?: string;
  titleTH?: string;
  firstNameTH?: string;
  lastNameTH?: string;
  fullNameTH?: string;
  address?: string;
};

type ReaderInstance = {
  init: () => void;
  onReadComplete: (cb: (data: SmartCardData) => void) => void;
  onReadError: (cb: (err: unknown) => void) => void;
};

type ReaderCtor = new (opts?: {
  insertCardDelay?: number;
  readTimeout?: number;
}) => ReaderInstance;

let cached: ReaderCtor | null = null;

async function loadReaderCtor(): Promise<ReaderCtor> {
  if (cached) return cached;
  // The package's "main" (build/src/index.js) is a stale standalone script:
  // it exports nothing usable AND eager-requires a missing ../config.json
  // (→ "Cannot find module" then "ThaiIdCardReader is not a constructor").
  // The real public API is build/index.js — it exports `ThaiIdCardReader`
  // (matches the package's own index.d.ts + demo) and its send-to-server
  // takes options, so it never touches config.json. Import it explicitly and
  // resolve the constructor defensively across CJS/ESM interop.
  const mod = (await import("thai-id-card-reader/build/index")) as unknown as {
    ThaiIdCardReader?: ReaderCtor;
    default?: { ThaiIdCardReader?: ReaderCtor } | ReaderCtor;
  };
  const fromDefault =
    typeof mod.default === "function"
      ? (mod.default as ReaderCtor)
      : mod.default?.ThaiIdCardReader;
  const Ctor = mod.ThaiIdCardReader ?? fromDefault;
  if (typeof Ctor !== "function") {
    throw new Error(
      "thai-id-card-reader: ไม่พบ ThaiIdCardReader constructor ในไลบรารี",
    );
  }
  cached = Ctor;
  return cached;
}

// Parse the raw address string the library returns. Format observed in
// the wild (real ID cards from Mahaadthai):
//   "<houseNo> หมู่ที่ <moo> ซอย <soi> ถนน <road> ตำบล/แขวง <sub>
//    อำเภอ/เขต <dist> จังหวัด <prov>"
// Postal code isn't on the chip — frontend looks it up if needed.
function parseAddress(raw: string | undefined): {
  houseNo?: string;
  moo?: string;
  soi?: string;
  road?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
} | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/\s+/g, " ").trim();

  const pickAfter = (key: RegExp): string | undefined => {
    const m = text.match(key);
    if (!m) return undefined;
    return m[1]?.trim() || undefined;
  };

  // Look for "ตำบล <x>" / "แขวง <x>" — the chip uses either depending on
  // whether the holder lives in Bangkok or upcountry.
  const subDistrict =
    pickAfter(/(?:ตำบล|แขวง)\s+([^\s]+(?:\s+[^\s]+)*?)(?=\s+(?:อำเภอ|เขต|จังหวัด)|$)/) ??
    undefined;
  const district =
    pickAfter(/(?:อำเภอ|เขต)\s+([^\s]+(?:\s+[^\s]+)*?)(?=\s+จังหวัด|$)/) ??
    undefined;
  const province = pickAfter(/จังหวัด\s+(.+)$/);
  const moo = pickAfter(/หมู่(?:ที่)?\s+(\d+)/);
  const soi = pickAfter(/ซอย\s+(\S+)/);
  const road = pickAfter(/(?:ถนน|ถ\.)\s+(\S+)/);

  // House number is whatever comes before "หมู่/ตำบล/แขวง/ซอย" — fall back
  // to the very first token.
  const houseNoMatch = text.match(/^(\S+)/);
  const houseNo = houseNoMatch ? houseNoMatch[1] : undefined;

  return { houseNo, moo, soi, road, subDistrict, district, province };
}

function splitFullName(full: string | undefined): {
  firstNameTh?: string;
  lastNameTh?: string;
} {
  if (!full) return {};
  // Library returns "ชื่อ นามสกุล" with a single space — Thai cards
  // never have a middle name on the chip.
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstNameTh: parts[0] };
  const firstNameTh = parts[0];
  const lastNameTh = parts.slice(1).join(" ");
  return { firstNameTh, lastNameTh };
}

async function readOnce(): Promise<SmartCardData> {
  const Ctor = await loadReaderCtor();
  const reader = new Ctor({
    insertCardDelay: 200,
    readTimeout: READER_TIMEOUT_MS,
  });

  return new Promise<SmartCardData>((resolve, reject) => {
    let settled = false;
    const safe = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const overallTimer = setTimeout(() => {
      safe(() =>
        reject(
          new Error(
            "timeout — ไม่พบบัตร/reader ภายในเวลา (เสียบบัตรค้างไว้แล้วลองใหม่)",
          ),
        ),
      );
    }, READER_TIMEOUT_MS + 1000);

    reader.onReadComplete((data) => {
      clearTimeout(overallTimer);
      safe(() => resolve(data));
    });
    reader.onReadError((err) => {
      clearTimeout(overallTimer);
      safe(() => reject(err));
    });
    try {
      reader.init();
    } catch (err) {
      clearTimeout(overallTimer);
      safe(() => reject(err));
    }
  });
}

// Express handler — kept in this file so `server.ts` stays small.
export async function handleReadId(_req: Request, res: Response): Promise<void> {
  try {
    const raw = await readOnce();
    const nameSplit =
      raw.firstNameTH || raw.lastNameTH
        ? { firstNameTh: raw.firstNameTH, lastNameTh: raw.lastNameTH }
        : splitFullName(raw.fullNameTH);
    res.json({
      cid: raw.citizenID ?? "",
      titleTh: raw.titleTH,
      firstNameTh: nameSplit.firstNameTh,
      lastNameTh: nameSplit.lastNameTh,
      address: parseAddress(raw.address),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const noReader =
      /reader|pcsc|smartcard|no card/i.test(message) &&
      /(not|no).*(found|present)|connect/i.test(message);
    res.status(noReader ? 503 : 500).json({
      error: noReader ? "reader_not_found" : "read_failed",
      message,
    });
  }
}
