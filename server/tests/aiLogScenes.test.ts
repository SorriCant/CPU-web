import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AI_LOG_SCENES, aiLogSceneLabel, aiLogSceneOptions } from "../src/shared/aiLogScenes";

const serverSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

test("every scene the server logs is offered in the admin filters", () => {
  const known = new Set<string>(AI_LOG_SCENES.map((item) => item.value));
  const logged = new Set<string>();
  for (const file of sourceFiles(path.join(serverSrc, "services"))) {
    const source = readFileSync(file, "utf8");
    // startAiReviewLog({ kind: "…" }) 和审核调用的 logContext: { kind: "…" }。
    for (const match of source.matchAll(/(?:startAiReviewLog\(\{|logContext:\s*\{)\s*kind:\s*"([a-z-]+)"/g)) logged.add(match[1]);
  }
  assert.ok(logged.size >= 10, `only found ${[...logged].join(", ")}`);
  assert.deepEqual([...logged].filter((kind) => !known.has(kind)), []);
  for (const kind of ["direct-message", "nickname", "profile", "smart-post"]) assert.ok(known.has(kind), kind);
});

test("scene values are unique and unknown scenes still get an option and a label", () => {
  const values = AI_LOG_SCENES.map((item) => item.value);
  assert.equal(new Set(values).size, values.length);
  assert.equal(aiLogSceneLabel("nickname"), "昵称审核");
  assert.equal(aiLogSceneLabel("legacy-scene"), "legacy-scene");
  assert.equal(aiLogSceneLabel(""), "未知场景");
  const options = aiLogSceneOptions(["topic", "legacy-scene", "", null, "legacy-scene"]);
  assert.equal(options.length, values.length + 1);
  assert.deepEqual(options[options.length - 1], { value: "legacy-scene", label: "legacy-scene" });
});
