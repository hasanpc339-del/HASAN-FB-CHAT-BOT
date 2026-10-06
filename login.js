const fs = require("fs");
const path = require("path");
const login = require("sahu-fca");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getAppStatePath() {
  let config = {};

  try {
    config = readJson(CONFIG_PATH);
  } catch (error) {
    console.error("❌ config.json পড়তে সমস্যা:", error.message);
    process.exit(1);
  }

  const configuredPath =
    typeof config.APPSTATEPATH === "string" &&
    config.APPSTATEPATH.trim()
      ? config.APPSTATEPATH.trim()
      : "appstate.json";

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(ROOT, configuredPath);
}

function validateAppState(appState) {
  if (!Array.isArray(appState) || appState.length === 0) {
    throw new Error("AppState array খালি বা invalid।");
  }

  const names = new Set(
    appState
      .filter(cookie => cookie && typeof cookie === "object")
      .map(cookie => String(cookie.key || "").trim())
  );

  if (!names.has("c_user") || !names.has("xs")) {
    throw new Error(
      "AppState-এ প্রয়োজনীয় c_user অথবা xs cookie পাওয়া যায়নি।"
    );
  }
}

async function main() {
  const appStatePath = getAppStatePath();

  if (!fs.existsSync(appStatePath)) {
    console.error(`❌ AppState পাওয়া যায়নি: ${appStatePath}`);
    process.exit(1);
  }

  let appState;

  try {
    appState = readJson(appStatePath);
    validateAppState(appState);
  } catch (error) {
    console.error("❌ AppState invalid:", error.message);
    process.exit(1);
  }

  console.log("🔐 Facebook AppState দিয়ে login শুরু হচ্ছে...");

  const options = {
    appState,
    selfListen: false,
    listenEvents: true,
    autoMarkDelivery: false,
    autoMarkRead: false,
    online: true
  };

  login(options, (error, api) => {
    if (error) {
      console.error("❌ Facebook login failed.");

      if (error.errorDescription) {
        console.error("Reason:", error.errorDescription);
      } else if (error.error) {
        console.error("Reason:", error.error);
      } else if (error.message) {
        console.error("Reason:", error.message);
      } else {
        console.error(error);
      }

      process.exit(1);
      return;
    }

    console.log("✅ Facebook login successful!");
    console.log("👤 Logged-in UID:", api.getCurrentUserID());

    try {
      const latestAppState =
        typeof api.getAppState === "function"
          ? api.getAppState()
          : null;

      if (
        Array.isArray(latestAppState) &&
        latestAppState.length > 0
      ) {
        const backupPath = `${appStatePath}.backup`;

        if (fs.existsSync(appStatePath)) {
          fs.copyFileSync(
            appStatePath,
            backupPath
          );
        }

        writeJson(
          appStatePath,
          latestAppState
        );

        console.log("💾 Updated AppState saved.");
        console.log(
          "📦 Previous AppState backup:",
          path.basename(backupPath)
        );
      } else {
        console.log(
          "ℹ️ API থেকে নতুন AppState পাওয়া যায়নি; বর্তমান AppState রাখা হয়েছে।"
        );
      }
    } catch (saveError) {
      console.warn(
        "⚠️ Updated AppState save করা যায়নি:",
        saveError.message
      );
    }

    if (typeof api.logout === "function") {
      api.logout(() => {
        console.log("🚪 Login test শেষ।");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

process.on("uncaughtException", error => {
  console.error(
    "❌ Unexpected error:",
    error.message
  );
  process.exit(1);
});

process.on("unhandledRejection", error => {
  console.error(
    "❌ Unhandled rejection:",
    error && error.message
      ? error.message
      : error
  );
  process.exit(1);
});

main();
