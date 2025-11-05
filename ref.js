const puppeteer = require('puppeteer');

async function openChrome() {
    try {
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            defaultViewport: null,
            args: [
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = await browser.newPage();
        
        // 자동화 감지 방지
        await page.evaluateOnNewDocument(() => {
            delete navigator.__proto__.webdriver;
        });

        // 기본 헤더 설정
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        });

        await page.goto('https://wing.coupang.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        
        // 브라우저를 계속 열어둡니다
        // await browser.close();
    } catch (error) {
        console.error('에러 발생:', error);
    }
}

openChrome(); 
