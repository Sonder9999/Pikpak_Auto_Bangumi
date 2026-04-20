// Entry point - dispatches to server or cli mode
const args = process.argv.slice(2);
const modeIdx = args.indexOf("--mode");
const mode = modeIdx !== -1 ? args[modeIdx + 1] : "server";

if (mode === "cli") {
  await import("./cli/index.ts");
} else {
  await import("./server/index.ts");
}
