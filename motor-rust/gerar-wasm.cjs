const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const build = spawnSync("cargo", ["build", "--release", "--locked", "--target", "wasm32-unknown-unknown"], {
  cwd: __dirname,
  stdio: "inherit"
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const wasm = fs.readFileSync(path.join(__dirname, "target", "wasm32-unknown-unknown", "release", "dre_motor.wasm"));
const output = path.join(__dirname, "..", "Dimensionamento de Fossa 6.0", "resources", "app", "js", "motor-rust.js");
const encoded = wasm.toString("base64");
fs.writeFileSync(output, `/* Gerado por motor-rust/gerar-wasm.cjs. O código-fonte está em motor-rust/src/lib.rs. */
(function (root) {
  "use strict";
  const bytes = Uint8Array.from(atob("${encoded}"), char => char.charCodeAt(0));
  const motor = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
  if (typeof module === "object" && module.exports) module.exports = motor;
  else root.DRE_RUST = motor;
})(globalThis);
`);
