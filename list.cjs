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

        // 標準出力を取得
        child.stdout.on("data", (data) => {
          stdoutData += data.toString();
        });

        // 標準エラー出力を取得
        child.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        // プロセス終了時の処理
        child.on("close", (code) => {
          if (code === 0) {
            resolve(stdoutData.trim()); // 成功時
          } else {
            reject(new Error(`終了コード ${code}: ${stderrData.trim()}`)); // エラー時
          }
        });

        // エラー発生時の処理
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

    // const results = await list.reduce(async (prevPromise, file) => {
    //   const args = [file.fileUrl, file.outputUrl];
    //   const scriptPath = "./index.js";

    //   await runNodeScript(scriptPath, args);
    //   return [];
    // }, Promise.resolve([]));

    //   list.map(async (file) => {
    //     const args = [file.fileUrl, file.outputUrl];
    //     const scriptPath = './index.js';

    //     await runNodeScript(scriptPath, args);

    //     // Node.js プロセスを実行
    //     // const child = spawn("node", ['./index.js', ...args]);

    //     // // 標準出力を受け取る
    //     // child.stdout.on("data", (data) => {
    //     //   console.log(`stdout: ${data}`);
    //     // });

    //     // // 標準エラー出力を受け取る
    //     // child.stderr.on("data", (data) => {
    //     //   console.error(`stderr: ${data}`);
    //     // });

    //     // // プロセス終了時の処理
    //     // child.on("close", (code) => {
    //     //   console.log(`子プロセスが終了しました。終了コード: ${code}`);
    //     // });
    //     return;
    //   });

    // 結果を出力またはファイルに保存
    // console.log(list);

    // ファイルに保存する場合
    //   fs.writeFileSync("checklist.md", markdownChecklist);
    //   console.log("checklist.md に書き出しました。");
  } catch (error) {
    console.error("エラー:", error);
  }
};

main();
