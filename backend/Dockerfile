FROM python:3.11-slim

WORKDIR /app

# 운영 환경에서는 의존성 캐시 효율을 위해 requirements 만 먼저 복사한다.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 운영 포트는 8010 (start.bat / docker-compose / next rewrites 와 동일).
EXPOSE 8010

# 운영용: --reload 사용 금지. inotify watcher 누수 + 안정성 위험.
# 코드 변경은 이미지 재빌드로 반영한다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
