const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { timeout } = require("puppeteer");

/**
 * 指定されたフォルダ内のファイルを再帰的に取得
 * @param {string} dirPath - ルートフォルダのパス
 * @param {string} basePath - ベースパス（フォルダ名を保持）
 * @param {Array} fileList - ファイルリスト（再帰用）
 * @returns {Array} - ファイルパスのリスト
 */
function getFilesRecursively(dirPath, basePath = "", fileList = []) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const relativePath = path.join(basePath, item);

    if (fs.statSync(fullPath).isDirectory()) {
      // ディレクトリの場合、再帰的に探索
      getFilesRecursively(fullPath, relativePath, fileList);
    } else {
      // ファイルの場合、リストに追加
      fileList.push(relativePath);
    }
  }

  return fileList;
}

function generateMarkdownChecklist(files) {
  return files.map((file) => {
    return {
      fileUrl: `http://127.0.0.1:8080/${file}`,
      outputUrl: `./output/${file}`.replace(".glb", ".png"),
    };
  });
}

// 実行例
const targetFolder = "./public"; // 対象フォルダのパス

const main = async () => {
  try {
    const files = getFilesRecursively(targetFolder);
    const list = generateMarkdownChecklist(files);

    async function runNodeScript(scriptPath, args = []) {
      return new Promise((resolve, reject) => {
        const child = spawn("node", [scriptPath, ...args], { timeout: 60000 });

        let stdoutData = "";
        let stderrData = "";

        child.stdout.on("data", (data) => {
          stdoutData += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve(stdoutData.trim());
          } else {
            reject(new Error(`終了コード ${code}: ${stderrData.trim()}`));
          }
        });

        child.on("error", (err) => {
          reject(err);
        });
      });
    }

    for (const file of list) {
      if (file.fileUrl.includes(".DS_Store")) {
        continue;
      }
      console.log("file2 :>> ", file);
      const args = [file.fileUrl, file.outputUrl];
      const scriptPath = "./index.js";

      await runNodeScript(scriptPath, args);
    }
  } catch (error) {
    console.error("エラー:", error);
  }
};

main();
