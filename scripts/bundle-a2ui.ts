import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const HASH_FILE = join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = join(ROOT_DIR, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

async function main() {
  if (!existsSync(A2UI_RENDERER_DIR) || !existsSync(A2UI_APP_DIR)) {
    if (existsSync(OUTPUT_FILE)) {
      console.log("A2UI sources missing; keeping prebuilt bundle.");
      return;
    }
    console.error(`A2UI sources missing and no prebuilt bundle found at: ${OUTPUT_FILE}`);
    process.exit(1);
  }

  const inputPaths = [
    join(ROOT_DIR, "package.json"),
    join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  const currentHash = await computeHash(inputPaths);

  if (existsSync(HASH_FILE) && existsSync(OUTPUT_FILE)) {
    const previousHash = await readFile(HASH_FILE, "utf-8");
    if (previousHash.trim() === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  console.log("Building A2UI bundle...");
  try {
    execSync(`pnpm -s exec tsc -p "${join(A2UI_RENDERER_DIR, "tsconfig.json")}"`, {
      stdio: "inherit",
      cwd: ROOT_DIR,
    });
    // rolldown might need specific handling or just run via npx if installed
    // The original script ran: rolldown -c ...
    // Assuming rolldown is in PATH or node_modules/.bin
    execSync(`npx rolldown -c "${join(A2UI_APP_DIR, "rolldown.config.mjs")}"`, {
      stdio: "inherit",
      cwd: ROOT_DIR,
    });

    await writeFile(HASH_FILE, currentHash);
    console.log("A2UI bundle built successfully.");
  } catch (error) {
    console.error("A2UI bundling failed.", error);
    process.exit(1);
  }
}

async function computeHash(paths: string[]): Promise<string> {
  const files: string[] = [];

  async function walk(entryPath: string) {
    const st = await stat(entryPath);
    if (st.isDirectory()) {
      const entries = await readdir(entryPath);
      for (const entry of entries) {
        await walk(join(entryPath, entry));
      }
    } else {
      files.push(entryPath);
    }
  }

  for (const path of paths) {
    if (existsSync(path)) {
      await walk(path);
    }
  }

  files.sort(); // Consistent order

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = relative(ROOT_DIR, filePath).replace(/\\/g, "/"); // Normalize slashes
    hash.update(rel);
    hash.update("\0");
    const content = await readFile(filePath);
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
