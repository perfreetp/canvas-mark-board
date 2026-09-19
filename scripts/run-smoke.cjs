/**
 * 无浏览器冒烟测试：用 esbuild 打包 scripts/smoke/test*.ts 后在 node 中运行。
 * 用法：node scripts/run-smoke.cjs
 */
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function resolveEsbuild() {
  const pnpmDir = path.join(root, "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    const dir = fs
      .readdirSync(pnpmDir)
      .filter((d) => d.startsWith("esbuild@"))
      .sort()
      .pop();
    if (dir) {
      const entry = path.join(pnpmDir, dir, "node_modules", "esbuild");
      if (fs.existsSync(entry)) return require(entry);
    }
  }
  return require("esbuild");
}
const esbuild = resolveEsbuild();

const smokeDir = path.join(root, "scripts", "smoke");
const files = fs
  .readdirSync(smokeDir)
  .filter((f) => /^test.*\.ts$/.test(f))
  .sort();

(async () => {
  let failed = 0;
  for (const file of files) {
    const out = path.join("/tmp", file.replace(/\.ts$/, ".cjs"));
    await esbuild.build({
      entryPoints: [path.join(smokeDir, file)],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: out,
      alias: {
        "canvas-mark-board": path.join(
          root,
          "package/canvas-mark-board/index.ts"
        ),
      },
    });
    process.stdout.write(`\n=== ${file} ===\n`);
    try {
      execFileSync(process.execPath, [out], { stdio: "inherit" });
    } catch {
      failed += 1;
    }
  }
  process.exit(failed ? 1 : 0);
})();
