/**
 * Workaround for thai-id-card-reader@1.0.54.
 *
 * Its build/src/index.js eagerly imports sendToServer.js, which does
 * `require("../config.json")` at module top — but the published npm package
 * omits config.json, so loading the library throws "Cannot find module
 * '../config.json'" on a fresh install (even though this agent never uses the
 * send-to-server feature — it only drives ThaiIDCardReader directly).
 *
 * Write a tiny stub so the require resolves. Runs as `postinstall`, idempotent.
 * The stub URL is empty; sendToServer is never invoked by this agent, so the
 * "Invalid server URL" guard inside it is never reached.
 */
const fs = require("fs");
const path = require("path");

const base = path.join(
  __dirname,
  "..",
  "node_modules",
  "thai-id-card-reader",
);
const stub = JSON.stringify({ url: "" });

// Cover both module layouts the package ships:
//  - build/src/sendToServer.js → require("../config.json") = build/config.json
//  - build/send-to-server.js   → require("../config.json") = <pkg>/config.json
const targets = [
  path.join(base, "build", "config.json"),
  path.join(base, "config.json"),
];

for (const target of targets) {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, stub);
    console.log("[fix-ticr-config] wrote", target);
  } catch (err) {
    console.warn("[fix-ticr-config] skipped", target, "-", err.message);
  }
}
