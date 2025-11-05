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

  // K(10), L(11) 컬럼에 체크박스(BOOLEAN 데이터 검증) 추가 및 초기값 FALSE
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
          // A: 날짜, B: 판매자ID, C: 판매자이름, D: 현재탭이동URL, E: 고유아이디, F: 몰이름, G: 등급, H: 전체상품수
          await appendRowWithCheckboxes(
            spreadsheetId,
            outSheetName,
            [today, brandId, outputSellerName, changedUrl, uniqueId || '', mallName, sellerGrade, totalProductCount]
          );
          console.log(`📝 시트 기록 완료: ${outSheetName} 시트 A:H + K,L 체크박스`);
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
        // 이전 반복의 탭을 닫음 (첫 반복이 아닌 경우)
        if (previousLinkPage && shouldClosePage) {
          try { await previousLinkPage.close(); } catch (_) {}
        }
        // 현재 반복의 탭을 다음 반복을 위해 저장 (break가 아닌 경우)
        if (shouldClosePage && linkPage) {
          previousLinkPage = linkPage;
        }
        // break가 아닌 경우에만 대기
        if (shouldClosePage) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    
    // 루프 종료 후 마지막 탭은 보존 (닫지 않음)
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


