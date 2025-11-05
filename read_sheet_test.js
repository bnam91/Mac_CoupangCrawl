const path = require("path");
const dotenv = require("dotenv");
const { google } = require("googleapis");

const API_KEY_DIR = "/Users/a1/Documents/github/api_key";
const ENV_PATH = path.join(API_KEY_DIR, ".env");

// 외부 auth.js는 자체 의존성을 사용 (별도 검색 경로 보강 불필요)

function ensureEnvLoaded() {
  // 지정된 .env를 로드한다. auth.js가 참조할 수 있게 선 로드
  dotenv.config({ path: ENV_PATH, override: false });
}

function importAuthModule() {
  // 고정 경로만 사용
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("/Users/a1/Documents/github/api_key/auth.js");
}

async function fetchFirstFiveRows(spreadsheetId, sheetName) {
  ensureEnvLoaded();
  const auth = importAuthModule();

  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: "v4", auth: creds });
  const rangeA1 = `${sheetName}!A1:Z5`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeA1,
    majorDimension: "ROWS",
  });

  const values = res.data.values || [];
  return values;
}

async function main() {
  const spreadsheetId = "1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8";
  const sheetName = "테스트";

  try {
    const rows = await fetchFirstFiveRows(spreadsheetId, sheetName);
    if (!rows || rows.length === 0) {
      console.log("데이터가 없습니다.");
      return;
    }
    rows.forEach((row, idx) => {
      console.log(`[${idx}] \t` + row.map(String).join("\t"));
    });
  } catch (e) {
    console.error("Google Sheets API 호출 실패:", e);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main();
}


