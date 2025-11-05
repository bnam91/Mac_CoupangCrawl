const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

// 외부 인증/환경설정 경로
const API_KEY_DIR = '/Users/a1/Documents/github/api_key';
const ENV_PATH = path.join(API_KEY_DIR, '.env');

function ensureEnvLoaded() {
  dotenv.config({ path: ENV_PATH, override: false });
}

function importAuthModule() {
  // 외부 고정 경로의 auth 모듈 사용
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require('/Users/a1/Documents/github/api_key/auth.js');
}

// 브랜드 ID 추출: shop.coupang.com 도메인에서 경로 세그먼트 중
// 1) A로 시작하는 숫자형 (예: A00855946) 우선
// 2) 없으면 영문/숫자/언더스코어/대시로 이루어진 문자형 (예: ruave)
// /vid, /vidv1 등 중간 경로가 있어도 이후 세그먼트에서 매칭
function extractBrandId(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!/^(?:.*\.)?shop\.coupang\.com$/i.test(u.hostname)) return '추출불가';
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '추출불가';
    // 우선순위 1: A로 시작하는 숫자형
    const aId = segments.find(seg => /^A\d+$/i.test(seg));
    if (aId) return aId;
    // 우선순위 2: 문자형 ID (영문/숫자/_/-)
    const textId = segments.find(seg => /^[A-Za-z][A-Za-z0-9_-]*$/.test(seg));
    return textId || '추출불가';
  } catch (_) {
    return '추출불가';
  }
}

// 시트 ID 조회
async function getSheetIdByTitle(spreadsheetId, sheetTitle) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = (meta.data.sheets || []).find(s => s.properties && s.properties.title === sheetTitle);
  return sheet ? sheet.properties.sheetId : null;
}

// 시트 존재 보장 (없으면 생성) 후 sheetId 반환
async function ensureSheet(spreadsheetId, sheetTitle) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = (meta.data.sheets || []).find(s => s.properties && s.properties.title === sheetTitle);
  if (existing) return existing.properties.sheetId;
  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
  });
  const reply = created.data.replies && created.data.replies[0] && created.data.replies[0].addSheet;
  return reply && reply.properties ? reply.properties.sheetId : null;
}

// 오늘 날짜 YYYY-MM-DD
function formatTodayYYYYMMDD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A:D에 값 append 후, 동일 행의 I:J에 체크박스 추가
async function appendRowWithCheckboxes(spreadsheetId, sheetTitle, values) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });

  const sheetId = await ensureSheet(spreadsheetId, sheetTitle);

  const appendResp = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    includeValuesInResponse: true,
    responseValueRenderOption: 'UNFORMATTED_VALUE',
    responseDateTimeRenderOption: 'FORMATTED_STRING',
    requestBody: { values: [values] },
  });

  const updates = appendResp.data.updates;
  const updatedRange = updates && updates.updatedRange; // 예: '테스트2!A10:D10'
  let rowIndex0 = null;
  if (updatedRange) {
    const m = updatedRange.match(/!(?:[A-Z]+)(\d+):/);
    if (m) {
      const row1 = parseInt(m[1], 10); // 1-based
      rowIndex0 = row1 - 1;
    }
  }

  if (rowIndex0 == null) return;

  // I(8), J(9) 컬럼에 체크박스(BOOLEAN 데이터 검증) 추가 및 초기값 FALSE
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex0,
              endRowIndex: rowIndex0 + 1,
              startColumnIndex: 8,
              endColumnIndex: 10,
            },
            cell: {
              userEnteredValue: { boolValue: false },
              dataValidation: {
                condition: { type: 'BOOLEAN' },
                strict: true,
                showCustomUi: true,
              },
            },
            fields: 'userEnteredValue,dataValidation',
          },
        },
      ],
    },
  });
}

// '테스트' 시트의 특정 행 G열에 값 업데이트
async function updateSheetGCell(spreadsheetId, sheetTitle, rowNumber1Based, value) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  const range = `${sheetTitle}!G${rowNumber1Based}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(value)]] },
  });
}

async function fetchNextLinkWhereGEmpty(spreadsheetId, sheetName) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  // C열과 G열을 2행부터 끝까지 조회 (헤더는 1행)
  const rangeA1 = `${sheetName}!C2:G`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeA1,
    majorDimension: 'ROWS',
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    const cCol = rows[i][0] ? String(rows[i][0]).trim() : '';
    // range가 C..G 이므로 G는 인덱스 4
    const gCol = rows[i][4] ? String(rows[i][4]).trim() : '';
    if (!gCol) {
      // i=0 => 실제 시트 행 번호는 2 + i
      const rowNumber = 2 + i;
      return { url: cCol, rowNumber };
    }
  }
  return { url: '', rowNumber: null };
}

async function openCoupang() {
  let browser;
  
  try {
    // Chrome 경로
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    // 브라우저 실행 옵션
    const options = {
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreHTTPSErrors: true,
    };
    
    // Chrome이 있으면 사용
    if (fs.existsSync(chromePath)) {
      options.executablePath = chromePath;
    }

    browser = await puppeteer.launch(options);
    console.log('✅ 크롬이 열렸습니다. 종료하려면 Ctrl+C를 누르세요.\n');

    // 첫 번째 페이지 사용
    const pages = await browser.pages();
    const page = pages[0];

    // 구글로 이동
    await page.goto('https://www.google.com');

    // 새 탭을 열어 쿠팡 사이트로 이동
    const coupangPage = await browser.newPage();
    await coupangPage.goto('https://www.coupang.com');

    // 루프: G열이 빈 행을 순차 처리
    const spreadsheetId = '1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8';
    const sheetName = '1.(DB)상품추가';
    const outSheetName = '2.(DB)지표셀러';
    const delayMs = 800;
    const maxSets = Infinity;
    let processed = 0;

    while (processed < maxSets) {
      let linkPage = null;
      let rowNumber = null;
      try {
        const { url: targetUrl, rowNumber: rn } = await fetchNextLinkWhereGEmpty(spreadsheetId, sheetName);
        rowNumber = rn;
        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          console.warn('⚠️ 더 이상 처리할 행이 없거나, C열 링크가 유효하지 않습니다. 루프 종료.');
          break;
        }

        linkPage = await browser.newPage();
        await linkPage.goto(targetUrl);
        console.log(`✅ 시트 C${rowNumber} 링크로 이동: ${targetUrl}`);

        const sellerLinkSelector = 'div.seller-info a[href*="shop.coupang.com"]';
        let foundSellerName = null;
        const sellerLinkHandle = await linkPage.waitForSelector(sellerLinkSelector, { timeout: 15000 });

        const sellerName = await linkPage.evaluate((aEl) => {
          const texts = [];
          for (const node of aEl.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const t = node.textContent.trim();
              if (t) texts.push(t);
            }
          }
          if (texts.length === 0) {
            const innerBtn = aEl.querySelector('div');
            const full = aEl.textContent.trim();
            const btn = innerBtn ? innerBtn.textContent.trim() : '';
            return btn && full.endsWith(btn) ? full.slice(0, full.length - btn.length).trim() : full;
          }
          return texts.join(' ').trim();
        }, sellerLinkHandle);

        foundSellerName = sellerName || null;
        console.log(`판매자 이름은 프린트  → ${sellerName || '판매자 이름을 찾을 수 없습니다.'}`);
        console.log('클릭하기');

        await sellerLinkHandle.evaluate((el) => {
          el.scrollIntoView({ block: 'center', inline: 'center' });
        });
        await Promise.all([
          linkPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
          sellerLinkHandle.click({ delay: 60 }),
        ]);

        const changedUrl = linkPage.url();
        console.log(`현재 탭 이동 URL: ${changedUrl}`);

        const brandId = extractBrandId(changedUrl);

        console.log('1. 판매자 이름');
        console.log(foundSellerName ? foundSellerName : '판매자 이름을 찾을 수 없습니다.');
        console.log('2. 현재탭이동 URL');
        console.log(changedUrl);
        console.log('3. 판매자 ID');
        console.log(brandId);

        try {
          const today = formatTodayYYYYMMDD();
          const outputSellerName = foundSellerName ? foundSellerName : '판매자 이름을 찾을 수 없습니다.';
          await appendRowWithCheckboxes(
            spreadsheetId,
            outSheetName,
            [today, brandId, outputSellerName, changedUrl]
          );
          console.log(`📝 시트 기록 완료: ${outSheetName} 시트 A:D + I,J 체크박스`);
          try {
            await updateSheetGCell(spreadsheetId, sheetName, rowNumber, today);
            console.log(`🗓️ ${sheetName}!G${rowNumber} = ${today}`);
          } catch (gErr) {
            console.warn('⚠️ G열 날짜 기록 실패:', gErr && gErr.message ? gErr.message : gErr);
          }
        } catch (writeErr) {
          console.warn('⚠️ 시트 기록 실패:', writeErr && writeErr.message ? writeErr.message : writeErr);
          try {
            const errMsg = (writeErr && writeErr.message ? writeErr.message : String(writeErr)).slice(0, 2000);
            await updateSheetGCell(spreadsheetId, sheetName, rowNumber, errMsg);
          } catch (_) {}
        }

      } catch (err) {
        console.warn('⚠️ 세트 처리 중 오류:', err && err.message ? err.message : err);
        if (rowNumber) {
          try {
            const errMsg = (err && err.message ? err.message : String(err)).slice(0, 2000);
            await updateSheetGCell('1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8', sheetName, rowNumber, errMsg);
          } catch (_) {}
        }
      } finally {
        processed += 1;
        try { if (linkPage) await linkPage.close(); } catch (_) {}
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    // 브라우저 종료 감지
    browser.on('disconnected', () => {
      console.log('브라우저가 닫혔습니다.');
      process.exit(0);
    });

    // 무한 대기
    await new Promise(() => {});

  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

// Ctrl+C 종료 처리
process.on('SIGINT', async () => {
  console.log('\n종료 중...');
  process.exit(0);
});

openCoupang();

