# 쿠팡 크롬 자동화

Node.js와 Puppeteer를 사용하여 쿠팡을 크롬 창으로 여는 스크립트입니다.

## 설치 방법

```bash
npm install
```

## 실행 방법

### 일반 모드
```bash
npm start
```

또는

```bash
node index.js
```

### 시크릿 모드
```bash
npm run start:secret
```

또는

```bash
node index-secret.js
```

## 기능

- 쿠팡 사이트를 크롬 창으로 자동으로 엽니다
- **일반 모드** (`index.js`): 캐시와 쿠키를 유지합니다
- **시크릿 모드** (`index-secret.js`): 실행할 때마다 모든 쿠키와 캐시를 자동으로 삭제하며, 완전히 분리된 브라우징 환경에서 실행됩니다
- 크롬 창이 최대화된 상태로 열립니다
- 브라우저를 닫으려면 Ctrl+C를 누르세요

