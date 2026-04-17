#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { playSound, notify, shouldNotify } = require("./platform");

function loadConfig() {
  try {
    const configPath = path.join(__dirname, "../config.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  let input = {};

  try {
    const raw = fs.readFileSync(0, "utf8");
    input = raw ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write("{}\n");
    return;
  }

  const config = loadConfig();

  if (!config || !config.enabled) {
    process.stdout.write("{}\n");
    return;
  }

  const hookConfig = config.hooks?.task_failed;
  if (!hookConfig || !hookConfig.enabled) {
    process.stdout.write("{}\n");
    return;
  }

  if (!shouldNotify()) {
    process.stdout.write("{}\n");
    return;
  }

  const soundsDir = config.sounds_directory
    ? path.resolve(__dirname, "../..", config.sounds_directory)
    : path.join(__dirname, "../sounds");

  const soundPath = path.join(soundsDir, hookConfig.sound);

  notify("Claude", "Task failed");
  playSound(soundPath);

  process.stdout.write("{}\n");
}

main();
