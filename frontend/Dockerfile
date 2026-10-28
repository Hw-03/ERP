FROM node:20-alpine

WORKDIR /app

# 의존성 캐시 — package*.json 만 먼저 복사.
COPY package.json package-lock.json* ./

# 운영용: lock 기준 정확히 설치 (npm install 금지).
RUN npm ci

COPY . .

# Next.js production 빌드 (.next-prod/ 산출물 생성). 환경변수는 compose 에서 주입.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000

# 운영용: 관리형 API 프록시와 custom server의 production 모드로 서빙.
CMD ["npm", "run", "start"]
