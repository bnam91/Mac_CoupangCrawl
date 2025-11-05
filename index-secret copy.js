const puppeteer = require('puppeteer');
const fs = require('fs');

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

