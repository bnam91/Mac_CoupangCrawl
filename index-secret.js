
// node index-secret.js

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
  return require('/Users/a1/Documents/github/api_key/auth.js');
}

// 오늘 날짜 YYYY-MM-DD
function formatTodayYYYYMMDD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// E열에서 마지막 'gb' 값 찾기 및 다음 값 생성
async function getNextGbId(spreadsheetId, sheetTitle) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  
  // E열 전체 읽기 (2행부터, 헤더는 1행)
  const range = `${sheetTitle}!E2:E`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: 'COLUMNS',
  });
  
  const eColumn = res.data.values && res.data.values[0] ? res.data.values[0] : [];
  let maxGbNumber = 0;
  
  // 'gb'로 시작하는 값들 중 최대 번호 찾기
  eColumn.forEach(cell => {
    if (cell && typeof cell === 'string') {
      const trimmed = cell.trim().toLowerCase();
      if (trimmed.startsWith('gb')) {
        const numStr = trimmed.slice(2);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxGbNumber) {
          maxGbNumber = num;
        }
      }
    }
  });
  
  // 다음 번호 생성 (gb078 형식)
  // E열에 gb 값이 없으면 gb001부터 시작
  const nextNumber = maxGbNumber === 0 ? 1 : maxGbNumber + 1;
  return `gb${String(nextNumber).padStart(3, '0')}`;
}

// 시트의 C열에서 기존 링크 목록 가져오기
async function getExistingLinks(spreadsheetId, sheetTitle) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  
  try {
    // C열 전체 읽기 (2행부터, 헤더는 1행)
    const range = `${sheetTitle}!C2:C`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: 'COLUMNS',
    });
    
    const cColumn = res.data.values && res.data.values[0] ? res.data.values[0] : [];
    const linkSet = new Set();
    
    cColumn.forEach(link => {
      if (link && typeof link === 'string') {
        // 링크 정규화 (공백 제거, 소문자로 변환하지 않음 - 정확히 일치해야 함)
        const normalizedLink = link.trim();
        if (normalizedLink) {
          linkSet.add(normalizedLink);
        }
      }
    });
    
    return linkSet;
  } catch (error) {
    console.warn('⚠️ 기존 링크 목록 가져오기 실패:', error.message);
    return new Set(); // 실패 시 빈 Set 반환
  }
}

// 시트에 행 추가
async function appendRowToSheet(spreadsheetId, sheetTitle, values) {
  ensureEnvLoaded();
  const auth = importAuthModule();
  const creds = await auth.getCredentials();
  const sheets = google.sheets({ version: 'v4', auth: creds });
  
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:E`,
    valueInputOption: 'USER_ENTERED', // 날짜 형식으로 인식되도록 변경
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function openCoupangIncognito() {
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
    console.log('✅ 시크릿 모드로 크롬이 열렸습니다. 종료하려면 Ctrl+C를 누르세요.\n');

    // 기본 페이지 닫기
    const pages = await browser.pages();
    if (pages.length > 0) {
      await pages[0].close();
    }

    // 시크릿 모드 컨텍스트 생성
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    // 캐시와 쿠키 삭제
    console.log('캐시와 쿠키를 초기화합니다...');
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    console.log('캐시와 쿠키가 삭제되었습니다.\n');

    // 구글로 이동
    await page.goto('https://www.google.com');

    // 새 탭 열기
    const newPage = await context.newPage();
    console.log('새 탭을 열었습니다.\n');

    // 쿠팡으로 이동
    await newPage.goto('https://www.coupang.com');
    console.log('✅ 쿠팡으로 이동했습니다.\n');

    // 다시 새 탭 열기
    const thirdPage = await context.newPage();
    console.log('새 탭을 열었습니다.\n');

    // 쿠팡 특정 페이지로 이동
    await thirdPage.goto('https://pages.coupang.com/p/121237?sourceType=gm_crm_goldbox&subSourceType=gm_crm_gwsrtcut', {
      waitUntil: 'networkidle0'
    });
    console.log('✅ 쿠팡 특정 페이지로 이동했습니다.');
    console.log('페이지 로딩 대기 중...');
    
    // 상품 목록이 로드될 때까지 동적으로 대기
    try {
      await thirdPage.waitForSelector('.discount-product-unit', { timeout: 10000 });
      console.log('페이지 로딩 완료.\n');
    } catch (error) {
      console.log('상품 목록 로딩 대기 중... (타임아웃 또는 요소 없음)');
      // 최소한의 대기 시간
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('페이지 로딩 완료.\n');
    }

    // 상품 추출 함수
    const extractProducts = async () => {
      return await thirdPage.evaluate(() => {
        const productList = [];
        const productUnits = document.querySelectorAll('.discount-product-unit');
        
        productUnits.forEach((unit, index) => {
          // 상품명
          const titleElement = unit.querySelector('.info_section__title');
          const title = titleElement ? titleElement.textContent.trim() : '';
          
          // 할인율
          const discountBadge = unit.querySelector('.sale_point_badge__content');
          const discount = discountBadge ? discountBadge.textContent.trim() : '';
          
          // 할인가
          const discountPriceElement = unit.querySelector('.price_info__discount');
          const discountPrice = discountPriceElement ? discountPriceElement.textContent.trim() : '';
          
          // 원가
          const basePriceElement = unit.querySelector('.price_info__base');
          const basePrice = basePriceElement ? basePriceElement.textContent.trim() : '';
          
          // 판매 진행률
          const progressElement = unit.querySelector('.sale-progress-bar__rate');
          const progress = progressElement ? progressElement.textContent.trim() : '';
          
          // 남은 시간
          const timerElement = unit.querySelector('.promotion-timer');
          const timer = timerElement ? timerElement.textContent.trim() : '';
          
          // 배지 확인 (로켓배송 or 판매자로켓)
          // 판매자로켓: logoRocketMerchantLargeV3R3@2x.png
          // 로켓배송: logo_rocket_large@3x.png
          const allBadges = unit.querySelectorAll('img[src*="rocket"], img[src*="Rocket"]');
          let badgeType = '';
          
          // 판매자로켓 배지 확인 (우선순위)
          for (let badge of allBadges) {
            const src = badge.getAttribute('src') || '';
            if (src.includes('logoRocketMerchantLargeV3R3@2x.png') || 
                src.includes('logoRocketMerchant')) {
              badgeType = '판매자로켓';
              break;
            }
          }
          
          // 판매자로켓이 아니면 로켓배송 확인
          if (!badgeType) {
            for (let badge of allBadges) {
              const src = badge.getAttribute('src') || '';
              if (src.includes('logo_rocket_large@3x.png') || 
                  src.includes('logo_rocket')) {
                badgeType = '로켓배송';
                break;
              }
            }
          }
          
          // 상품 링크
          const linkElement = unit.closest('a');
          const link = linkElement ? linkElement.href : '';
          
          if (title) {
            productList.push({
              title: title,
              discount: discount,
              discountPrice: discountPrice,
              basePrice: basePrice,
              progress: progress,
              timer: timer,
              badgeType: badgeType,
              link: link
            });
          }
        });
        
        return productList;
      });
    };

    // 상품 출력 함수
    const printProduct = (product, index) => {
      console.log(`\n[${index}] ${product.title}`);
      if (product.badgeType) {
        console.log(`  배지: ${product.badgeType}`);
      }
      if (product.discount) {
        console.log(`  할인율: ${product.discount}`);
      }
      if (product.discountPrice) {
        console.log(`  할인가: ${product.discountPrice}`);
      }
      if (product.basePrice) {
        console.log(`  원가: ${product.basePrice}`);
      }
      if (product.progress) {
        console.log(`  판매 진행률: ${product.progress}`);
      }
      if (product.timer) {
        console.log(`  남은 시간: ${product.timer}`);
      }
      if (product.link) {
        console.log(`  링크: ${product.link}`);
      }
    };

    // 스크롤을 끝까지 내려서 모든 상품 로드
    console.log('스크롤을 끝까지 내려서 모든 상품을 로드하는 중...');
    console.log('='.repeat(80));
    console.log('상품 리스트 (실시간)');
    console.log('='.repeat(80));
    
    await thirdPage.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 이미 출력한 상품 추적
    const printedProducts = new Set();
    // 모든 상품을 누적 저장할 배열
    const accumulatedProducts = [];
    let productIndex = 1;
    
    // 초기 상품 추출 및 출력
    let currentPageProducts = await extractProducts();
    currentPageProducts.forEach(product => {
      if (!printedProducts.has(product.title)) {
        printedProducts.add(product.title);
        accumulatedProducts.push(product); // 누적 배열에 추가
        printProduct(product, productIndex++);
      }
    });
    console.log(`\n현재까지 ${productIndex - 1}개의 상품을 찾았습니다.\n`);
    
    let previousHeight = 0;
    let currentHeight = await thirdPage.evaluate(() => document.body.scrollHeight);
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    
    while (previousHeight !== currentHeight && scrollAttempts < maxScrollAttempts) {
      previousHeight = currentHeight;
      
      // 점진적으로 스크롤 내리기
      await thirdPage.evaluate(() => {
        const scrollStep = 500;
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const targetScroll = Math.min(currentScroll + scrollStep, document.body.scrollHeight);
        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 스크롤 후 새로 로드된 상품 추출
      currentPageProducts = await extractProducts();
      let newProductsFound = false;
      
      currentPageProducts.forEach(product => {
        if (!printedProducts.has(product.title)) {
          printedProducts.add(product.title);
          accumulatedProducts.push(product); // 누적 배열에 추가
          printProduct(product, productIndex++);
          newProductsFound = true;
        }
      });
      
      if (newProductsFound) {
        console.log(`\n현재까지 ${productIndex - 1}개의 상품을 찾았습니다.\n`);
      }
      
      currentHeight = await thirdPage.evaluate(() => document.body.scrollHeight);
      scrollAttempts++;
      
      // 끝에 도달했는지 확인
      const scrollInfo = await thirdPage.evaluate(() => {
        return {
          scrollPosition: window.pageYOffset || document.documentElement.scrollTop,
          innerHeight: window.innerHeight
        };
      });
      
      if (scrollInfo.scrollPosition + scrollInfo.innerHeight >= currentHeight - 100) {
        await thirdPage.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 마지막 스크롤 후 최종 상품 확인
        currentPageProducts = await extractProducts();
        currentPageProducts.forEach(product => {
          if (!printedProducts.has(product.title)) {
            printedProducts.add(product.title);
            accumulatedProducts.push(product); // 누적 배열에 추가
            printProduct(product, productIndex++);
          }
        });
        break;
      }
    }
    
    // 추가 대기 시간 후 최종 확인
    await new Promise(resolve => setTimeout(resolve, 2000));
    currentPageProducts = await extractProducts();
    currentPageProducts.forEach(product => {
      if (!printedProducts.has(product.title)) {
        printedProducts.add(product.title);
        accumulatedProducts.push(product); // 누적 배열에 추가
        printProduct(product, productIndex++);
      }
    });
    
    // 누적된 모든 상품을 사용
    const allProducts = accumulatedProducts;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`스크롤 완료. (${scrollAttempts}번 시도)`);
    console.log(`총 ${productIndex - 1}개의 상품을 찾았습니다.\n`);

    // 판매자로켓 상품 필터링 (실시간으로 수집한 모든 상품 사용)
    const merchantRocketProducts = allProducts.filter(product => product.badgeType === '판매자로켓');
    console.log(`\n${'='.repeat(80)}`);
    console.log(`전체 상품 수: ${allProducts.length}개`);
    console.log(`판매자로켓 상품: ${merchantRocketProducts.length}개`);
    
    if (merchantRocketProducts.length > 0) {
      console.log('\n판매자로켓 상품 목록:');
      merchantRocketProducts.forEach((product, idx) => {
        console.log(`  ${idx + 1}. ${product.title.substring(0, 50)}...`);
      });
    }
    console.log();

    // 구글 스프레드시트에 추가
    if (merchantRocketProducts.length > 0) {
      const spreadsheetId = '1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8';
      const sheetTitle = '1.(DB)상품추가';
      const today = formatTodayYYYYMMDD();
      
      try {
        // 마지막 gb 값 찾기 및 다음 값 생성
        console.log('구글 시트에 연결 중...');
        
        // 기존 링크 목록 가져오기
        const existingLinks = await getExistingLinks(spreadsheetId, sheetTitle);
        console.log(`기존 링크 ${existingLinks.size}개 확인됨`);
        
        let currentGbId = await getNextGbId(spreadsheetId, sheetTitle);
        console.log(`다음 고유아이디: ${currentGbId}\n`);
        
        let addedCount = 0;
        let skippedCount = 0;
        
        // 각 판매자로켓 상품을 시트에 추가
        for (let i = 0; i < merchantRocketProducts.length; i++) {
          const product = merchantRocketProducts[i];
          const productLink = product.link ? product.link.trim() : '';
          
          // 중복 체크: 같은 링크가 이미 있으면 스킵
          if (existingLinks.has(productLink)) {
            console.log(`[${i + 1}/${merchantRocketProducts.length}] ⏭️  중복 (이미 등록됨): ${product.title.substring(0, 40)}...`);
            skippedCount++;
            continue;
          }
          
          const values = [
            today,                           // A열: 날짜
            '골드박스',                       // B열: 골드박스
            productLink,                     // C열: 링크
            product.title,                   // D열: 상품명
            currentGbId                      // E열: 고유아이디
          ];
          
          await appendRowToSheet(spreadsheetId, sheetTitle, values);
          existingLinks.add(productLink); // 추가한 링크를 목록에 추가 (같은 실행 중 중복 방지)
          addedCount++;
          console.log(`[${i + 1}/${merchantRocketProducts.length}] ✅ 시트에 추가: ${product.title.substring(0, 30)}... (${currentGbId})`);
          
          // 다음 고유아이디 생성 (gb078 -> gb079)
          const numStr = currentGbId.slice(2);
          const num = parseInt(numStr, 10);
          const nextNum = num + 1;
          currentGbId = `gb${String(nextNum).padStart(3, '0')}`;
          
          // 요청 간격 조절 (너무 빠르면 API 제한)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`\n✅ 총 ${addedCount}개의 판매자로켓 상품을 구글 시트에 추가했습니다.`);
        if (skippedCount > 0) {
          console.log(`⏭️  ${skippedCount}개의 중복 상품은 스킵되었습니다.\n`);
        } else {
          console.log();
        }
      } catch (error) {
        console.error('⚠️ 구글 시트 추가 중 오류:', error.message);
      }
    } else {
      console.log('판매자로켓 상품이 없어 시트에 추가하지 않습니다.\n');
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

openCoupangIncognito();

