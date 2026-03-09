const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const readline = require('readline');

// 외부 인증/환경설정 경로 - 우선순위: 환경변수 > API_KEY_DIR.txt > OS 자동 감지
function getApiKeyDir() {
  // 1순위: 환경 변수 (가장 높은 우선순위)
  if (process.env.API_KEY_DIR) {
    console.log(`📌 환경 변수에서 경로 사용: ${process.env.API_KEY_DIR}`);
    return process.env.API_KEY_DIR;
  }
  
  // 2순위: API_KEY_DIR.txt 파일 (선택사항, 사용자 커스터마이징용)
  const apiKeyDirFile = path.join(__dirname, 'API_KEY_DIR.txt');
  if (fs.existsSync(apiKeyDirFile)) {
    try {
      const customPath = fs.readFileSync(apiKeyDirFile, 'utf8').trim();
      if (customPath) {
        // 경로 정규화 및 존재 여부 확인
        const resolvedPath = path.resolve(customPath);
        if (fs.existsSync(resolvedPath)) {
          console.log(`📌 API_KEY_DIR.txt에서 경로 사용: ${resolvedPath}`);
          return resolvedPath;
        } else {
          console.warn(`⚠️ API_KEY_DIR.txt의 경로가 존재하지 않습니다: ${resolvedPath}`);
          console.warn(`⚠️ OS 자동 감지로 전환합니다.`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ API_KEY_DIR.txt 읽기 실패, 자동 감지로 전환: ${error.message}`);
    }
  }
  
  // 3순위: OS 자동 감지 (기본값)
  const platform = os.platform();
  const homeDir = os.homedir();
  
  let defaultPath;
  if (platform === 'win32') {
    // Windows: 여러 가능한 경로 시도
    const possiblePaths = [
      path.join(homeDir, 'Desktop', 'github', 'api_key'),
      path.join(homeDir, 'Documents', 'github', 'api_key'),
      path.join(homeDir, 'github', 'api_key'),
    ];
    // 첫 번째로 존재하는 경로 사용, 없으면 첫 번째를 기본값으로
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        console.log(`📌 OS 자동 감지 (존재하는 경로): ${possiblePath}`);
        return possiblePath;
      }
    }
    defaultPath = possiblePaths[0]; // 기본값은 Desktop
  } else if (platform === 'darwin') {
    // macOS: 여러 가능한 경로 시도
    const possiblePaths = [
      path.join(homeDir, 'Documents', 'github', 'api_key'),
      path.join(homeDir, 'Desktop', 'github', 'api_key'),
      path.join(homeDir, 'github', 'api_key'),
    ];
    // 첫 번째로 존재하는 경로 사용, 없으면 첫 번째를 기본값으로
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        console.log(`📌 OS 자동 감지 (존재하는 경로): ${possiblePath}`);
        return possiblePath;
      }
    }
    defaultPath = possiblePaths[0]; // 기본값은 Documents
  } else {
    // Linux 또는 기타 OS
    defaultPath = path.join(homeDir, 'Documents', 'github', 'api_key');
  }
  
  console.log(`📌 OS 자동 감지 (기본 경로): ${defaultPath}`);
  return defaultPath;
}

const API_KEY_DIR = getApiKeyDir();
const ENV_PATH = path.join(API_KEY_DIR, '.env');

// 초기 환경 변수 로드
function ensureEnvLoaded() {
  // .env 파일 존재 여부 확인
  if (!fs.existsSync(ENV_PATH)) {
    console.warn(`⚠️ .env 파일을 찾을 수 없습니다: ${ENV_PATH}`);
    return;
  }
  
  // 환경 변수 로드 (override: true로 설정하여 항상 최신 값으로 덮어쓰기)
  const result = dotenv.config({ path: ENV_PATH, override: true });
  
  // 로드 결과 확인
  if (result.error) {
    console.warn(`⚠️ .env 파일 로드 중 오류: ${result.error.message}`);
  } else {
    // 환경 변수 확인
    const hasClientId = !!process.env.GOOGLE_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    if (!hasClientId || !hasClientSecret) {
      console.warn(`⚠️ 환경 변수 확인: GOOGLE_CLIENT_ID=${hasClientId ? '있음' : '없음'}, GOOGLE_CLIENT_SECRET=${hasClientSecret ? '있음' : '없음'}`);
      console.warn(`⚠️ .env 파일 경로: ${ENV_PATH}`);
    }
  }
}

// 프로그램 시작 시 환경 변수 로드
ensureEnvLoaded();

function importAuthModule() {
  // auth.js 로드 전에 환경 변수 로드
  ensureEnvLoaded();
  
  // 현재 프로젝트의 node_modules를 모듈 검색 경로에 추가
  const Module = require('module');
  const currentProjectNodeModules = path.join(__dirname, 'node_modules');
  
  // 기존 모듈 경로 함수를 백업
  const originalNodeModulePaths = Module._nodeModulePaths;
  
  // auth.js가 로드될 때 현재 프로젝트의 node_modules를 우선 검색하도록 수정
  Module._nodeModulePaths = function(from) {
    const paths = originalNodeModulePaths.call(this, from);
    // 현재 프로젝트의 node_modules를 맨 앞에 추가
    if (!paths.includes(currentProjectNodeModules)) {
      paths.unshift(currentProjectNodeModules);
    }
    return paths;
  };
  
  try {
    const authPath = path.resolve(API_KEY_DIR, 'auth.js');
    if (!fs.existsSync(authPath)) {
      throw new Error(`auth.js 파일을 찾을 수 없습니다: ${authPath}`);
    }
    return require(authPath);
  } finally {
    // 원래 함수 복원
    Module._nodeModulePaths = originalNodeModulePaths;
  }
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

// A:H에 값 append 후, 동일 행의 K:L에 체크박스 추가
async function appendRowWithCheckboxes(spreadsheetId, sheetTitle, values) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });

  const sheetId = await ensureSheet(spreadsheetId, sheetTitle);

  const appendResp = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    includeValuesInResponse: true,
    responseValueRenderOption: 'UNFORMATTED_VALUE',
    responseDateTimeRenderOption: 'FORMATTED_STRING',
    requestBody: { values: [values] },
  });

  const updates = appendResp.data.updates;
  const updatedRange = updates && updates.updatedRange; // 예: '테스트2!A10:H10'
  let rowIndex0 = null;
  if (updatedRange) {
    const m = updatedRange.match(/!(?:[A-Z]+)(\d+):/);
    if (m) {
      const row1 = parseInt(m[1], 10); // 1-based
      rowIndex0 = row1 - 1;
    }
  }

  if (rowIndex0 == null) return;

  // I(8), K(10), L(11) 컬럼에 체크박스(BOOLEAN 데이터 검증) 추가 - I열은 TRUE, K/L열은 FALSE
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
              endColumnIndex: 9,
            },
            cell: {
              userEnteredValue: { boolValue: true },
              dataValidation: {
                condition: { type: 'BOOLEAN' },
                strict: true,
                showCustomUi: true,
              },
            },
            fields: 'userEnteredValue,dataValidation',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex0,
              endRowIndex: rowIndex0 + 1,
              startColumnIndex: 10,
              endColumnIndex: 12,
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
    // range가 C..G 이므로 E는 인덱스 2, G는 인덱스 4
    const eCol = rows[i][2] ? String(rows[i][2]).trim() : '';
    const gCol = rows[i][4] ? String(rows[i][4]).trim() : '';
    if (!gCol) {
      // i=0 => 실제 시트 행 번호는 2 + i
      const rowNumber = 2 + i;
      return { url: cCol, rowNumber, uniqueId: eCol };
    }
  }
  return { url: '', rowNumber: null, uniqueId: '' };
}

// 출력 시트 C열(판매자이름)에 값이 이미 존재하는지 확인
async function existsInOutputSheetByC(spreadsheetId, sheetTitle, valueToCheck) {
  if (!valueToCheck || !String(valueToCheck).trim()) return false;
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  const rangeA1 = `${sheetTitle}!C2:C`;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: rangeA1,
      majorDimension: 'COLUMNS',
    });
    const colValues = (res.data.values && res.data.values[0]) || [];
    const normalized = String(valueToCheck).trim();
    return colValues.some((v) => String(v || '').trim() === normalized);
  } catch (_) {
    return false;
  }
}

// 사용자 입력 받기 (5초 타임아웃, 기본값 y)
function askUserInput(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(question);
    rl.setPrompt('');
    
    let countdown = 5;
    let countdownInterval = null;
    
    // 카운트다운 표시 함수 (같은 줄에서 업데이트)
    const updateCountdown = () => {
      // ANSI escape code: \x1b[2K = 줄 지우기, \r = 커서를 줄 시작으로 이동
      process.stdout.write(`\r\x1b[2K⏰ ${countdown}초 후 자동으로 y로 처리됩니다... (y/n 입력 가능): `);
    };
    
    // 카운트다운 시작 (1초마다 업데이트)
    countdownInterval = setInterval(() => {
      countdown--;
      updateCountdown();
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        rl.close();
        process.stdout.write('\n');
        console.log('⏰ 5초 동안 입력이 없어 자동으로 y로 처리합니다.');
        resolve('y');
      }
    }, 1000);
    
    // 초기 카운트다운 표시
    updateCountdown();
    
    // 5초 타임아웃 설정 (백업용)
    const timeout = setTimeout(() => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      rl.close();
      process.stdout.write('\n');
      console.log('⏰ 5초 동안 입력이 없어 자동으로 y로 처리합니다.');
      resolve('y');
    }, 5000);

    rl.on('line', (input) => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      clearTimeout(timeout);
      rl.close();
      process.stdout.write('\n');
      const answer = input.trim().toLowerCase();
      resolve(answer === 'y' ? 'y' : 'n');
    });

    rl.on('close', () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      clearTimeout(timeout);
    });
  });
}

async function openCoupang() {
  let browser;
  
  try {
    // 가장 먼저 사용자 입력 받기
    const shouldAutoExit = await askUserInput('크롤링이 끝나면 코드를 종료할까요? (y/n, 5초 내 미입력 시 y): ');
    
    // 플랫폼별 Chrome 경로
    const platform = os.platform();
    let chromePath = null;
    
    if (platform === 'darwin') {
      // macOS
      chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platform === 'win32') {
      // Windows - 여러 가능한 경로 확인
      const possiblePaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ];
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          chromePath = possiblePath;
          break;
        }
      }
    } else if (platform === 'linux') {
      // Linux
      chromePath = '/usr/bin/google-chrome';
    }
    
    // 브라우저 실행 옵션
    const options = {
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--incognito',  // 브라우저를 직접 incognito 모드로 실행 (Windows 호환성)
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreHTTPSErrors: true,
    };
    
    // Chrome이 있으면 사용
    if (chromePath && fs.existsSync(chromePath)) {
      options.executablePath = chromePath;
      console.log(`Chrome 경로: ${chromePath}`);
    } else {
      console.log('시스템 Chrome을 찾을 수 없습니다. Puppeteer의 기본 Chrome을 사용합니다.');
    }

    browser = await puppeteer.launch(options);
    console.log('✅ 시크릿 모드로 크롬이 열렸습니다. 종료하려면 Ctrl+C를 누르세요.\n');

    // 첫 번째 페이지 사용
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    
    // 자동화 감지 방지
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
    });

    // 캐시와 쿠키 삭제
    console.log('캐시와 쿠키를 초기화합니다...');
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    console.log('캐시와 쿠키가 삭제되었습니다.\n');

    // 구글로 이동
    await page.goto('https://www.google.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 새 탭을 열어 쿠팡 사이트로 이동
    const coupangPage = await browser.newPage();
    await coupangPage.goto('https://www.coupang.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 루프: G열이 빈 행을 순차 처리
    const spreadsheetId = '1WdWdRvvfm4Cen6KA3yM1JMsr0CCceEMKJRgnmT49szM';
    const sheetName = '1.(DB)상품추가';
    const outSheetName = '2.(DB)지표셀러';
    const delayMs = 800;
    const maxSets = 8; // 한 번에 너무 많이 진행하면 막히므로 최대 8개만 처리
    let processed = 0;

    let previousLinkPage = null; // 이전 반복의 탭 저장
    while (processed < maxSets) {
      let linkPage = null;
      let rowNumber = null;
      let shouldClosePage = true; // 이 반복에서 탭을 닫을지 여부
      try {
        const { url: targetUrl, rowNumber: rn, uniqueId } = await fetchNextLinkWhereGEmpty(spreadsheetId, sheetName);
        rowNumber = rn;
        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          console.warn('⚠️ 더 이상 처리할 행이 없거나, C열 링크가 유효하지 않습니다. 루프 종료.');
          // 마지막 탭은 닫지 않기 위해 shouldClosePage를 false로 설정
          shouldClosePage = false;
          break;
        }

        linkPage = await browser.newPage();
        await linkPage.goto(targetUrl);
        console.log(`✅ 시트 C${rowNumber} 링크로 이동: ${targetUrl} (고유아이디: ${uniqueId || '-'})`);

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

        // 추가 크롤링: 몰 이름, 등급 추출 후 '전체 상품' 탭 클릭
        let mallName = '-';
        let sellerGrade = '-';
        let totalProductCount = '-';
        try {
          // 몰 이름 추출
          const mallNameEl = await linkPage.waitForSelector('h1.store-title', { timeout: 10000 });
          mallName = await linkPage.evaluate(el => el.textContent.trim(), mallNameEl);
          console.log(`크롤링하기 몰이름 → ${mallName}`);

          // 등급 추출 (없으면 '-') - 재시도 로직 포함
          const extractGrade = async (retryCount = 0) => {
            try {
              // 여러 방법으로 등급 요소 찾기 시도
              let gradeEl = null;
              try {
                gradeEl = await linkPage.waitForSelector('div.quallity-seller-badge', { timeout: 5000 });
              } catch (_) {
                // 대안: 클래스명이 약간 다를 수 있으므로 다른 선택자 시도
                gradeEl = await linkPage.$('div[class*="quallity-seller-badge"]');
              }
              
              if (gradeEl) {
                const gradeText = await linkPage.evaluate(el => {
                  // textContent로 전체 텍스트 추출 (자식 요소 포함)
                  const text = el.textContent.trim();
                  // "파워판매자" 같은 텍스트만 추출 (줄바꿈이나 공백 제거)
                  return text.split('\n')[0].split(/\s+/).join(' ').trim();
                }, gradeEl);
                
                if (gradeText && gradeText !== '') {
                  return gradeText;
                }
              }
              
              // 요소를 찾지 못했거나 값이 없으면 재시도
              if (retryCount < 2) {
                console.log(`등급 추출 실패 (${retryCount + 1}회 시도), 1초 후 재시도...`);
                await new Promise(r => setTimeout(r, 1000));
                return await extractGrade(retryCount + 1);
              }
              
              return '-';
            } catch (err) {
              if (retryCount < 2) {
                console.log(`등급 추출 오류 (${retryCount + 1}회 시도), 1초 후 재시도...`);
                await new Promise(r => setTimeout(r, 1000));
                return await extractGrade(retryCount + 1);
              }
              return '-';
            }
          };
          
          sellerGrade = await extractGrade();
          console.log(`크롤링하기 등급 → ${sellerGrade}`);

          // '전체 상품' 탭 클릭 (XPath로 찾기)
          const allProductsLinks = await linkPage.$x("//a[normalize-space(text())='전체 상품']");
          if (allProductsLinks.length > 0) {
            console.log('전체상품수 탭 클릭');
            await Promise.all([
              linkPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
              allProductsLinks[0].click({ delay: 60 }),
            ]);
            
            // 전체상품수 추출: "전체 (n)" 형식에서 n 값 추출 (재시도 로직 포함)
            const extractProductCount = async (retryCount = 0) => {
              try {
                await linkPage.waitForSelector('span.total-count', { timeout: 10000 });
                // 추가 대기 (동적 콘텐츠 로딩 대기)
                await new Promise(r => setTimeout(r, 500));
                
                const count = await linkPage.evaluate(() => {
                  // 여러 방법으로 시도
                  let totalCountEl = document.querySelector('span.total-count span.number');
                  if (!totalCountEl) {
                    // 대안: span.total-count에서 직접 추출
                    const totalCountParent = document.querySelector('span.total-count');
                    if (totalCountParent) {
                      const text = totalCountParent.textContent.trim();
                      const match = text.match(/전체\s*\((\d+)\)/);
                      if (match) return match[1];
                    }
                    return null;
                  }
                  const text = totalCountEl.textContent.trim();
                  // "(48)" 형식에서 숫자만 추출
                  const match = text.match(/\((\d+)\)/);
                  return match ? match[1] : null;
                });
                
                // 값이 없거나 '0'이면 재시도 (최대 2회)
                if (!count || count === '0' || count === '') {
                  if (retryCount < 2) {
                    console.log(`전체상품수 추출 실패 (${retryCount + 1}회 시도), 1초 후 재시도...`);
                    await new Promise(r => setTimeout(r, 1000));
                    return await extractProductCount(retryCount + 1);
                  }
                  return '-';
                }
                return count;
              } catch (err) {
                if (retryCount < 2) {
                  console.log(`전체상품수 추출 오류 (${retryCount + 1}회 시도), 1초 후 재시도...`);
                  await new Promise(r => setTimeout(r, 1000));
                  return await extractProductCount(retryCount + 1);
                }
                return '-';
              }
            };
            
            totalProductCount = await extractProductCount();
            console.log(`크롤링하기 전체상품수 → ${totalProductCount}`);
          } else {
            console.warn('⚠️ 전체 상품 탭을 찾을 수 없습니다.');
          }
        } catch (additionalErr) {
          console.warn('⚠️ 추가 크롤링 중 오류:', additionalErr && additionalErr.message ? additionalErr.message : additionalErr);
        }

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

          // C열(판매자이름) 기준 중복 체크: 이미 등록된 판매자면 스킵
          const alreadyExists = await existsInOutputSheetByC(spreadsheetId, outSheetName, outputSellerName);
          if (alreadyExists) {
            console.log(`⏭️ 이미 등록된 판매자(스킵): ${outputSellerName}`);
          } else {
            // A: 날짜, B: 판매자ID, C: 판매자이름, D: 현재탭이동URL, E: 고유아이디, F: 몰이름, G: 등급, H: 전체상품수
            await appendRowWithCheckboxes(
              spreadsheetId,
              outSheetName,
              [today, brandId, outputSellerName, changedUrl, uniqueId || '', mallName, sellerGrade, totalProductCount]
            );
            console.log(`📝 시트 기록 완료: ${outSheetName} 시트 A:H + K,L 체크박스`);
          }
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
            await updateSheetGCell('1WdWdRvvfm4Cen6KA3yM1JMsr0CCceEMKJRgnmT49szM', sheetName, rowNumber, errMsg);
          } catch (_) {}
        }
      } finally {
        processed += 1;
        // 이전 반복의 탭을 닫음 (첫 반복이 아닌 경우)
        if (previousLinkPage && shouldClosePage) {
          try { await previousLinkPage.close(); } catch (_) {}
        }
        // 현재 반복의 탭을 다음 반복을 위해 저장 (break가 아닌 경우)
        if (shouldClosePage && linkPage) {
          previousLinkPage = linkPage;
        }
        // break가 아닌 경우에만 대기 (랜덤 대기: 3-7초)
        if (shouldClosePage) {
          const randomDelay = Math.floor(Math.random() * 4000) + 3000; // 3000-7000ms (3-7초)
          console.log(`⏳ ${(randomDelay / 1000).toFixed(1)}초 랜덤 대기 후 다음 로우로 이동...`);
          await new Promise(r => setTimeout(r, randomDelay));
        }
      }
    }
    
    // 루프 종료 후 처리
    if (shouldAutoExit === 'y') {
      console.log('✅ 크롤링 완료. 브라우저를 종료합니다.');
      if (browser) {
        await browser.close();
      }
      process.exit(0);
    } else {
      // 마지막 탭은 보존 (닫지 않음)
      if (previousLinkPage) {
        console.log('✅ 크롤링 완료. 마지막 탭은 열어둡니다.');
      }

      // 브라우저 종료 감지
      browser.on('disconnected', () => {
        console.log('브라우저가 닫혔습니다.');
        process.exit(0);
      });

      // 무한 대기
      await new Promise(() => {});
    }

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


