# Imagem única: o backend FastAPI serve a API e o frontend compilado.
# Uso:  docker build -t metlife-crm .  &&  docker run -p 8000:8000 --env-file apps/api/.env -v crm-data:/app/apps/api/data metlife-crm

FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/apps/api
COPY apps/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api/ ./
COPY --from=web /web/dist /app/apps/web/dist
RUN useradd --create-home appuser && mkdir -p data && chown appuser data
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "python -m app.cli migrate && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
