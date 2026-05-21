FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api-server

COPY api-server/package*.json ./
RUN npm install

COPY api-server/tsconfig.json api-server/build.mjs ./
COPY api-server/src ./src

RUN npm run build

FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api-server

COPY --from=builder /app/api-server/node_modules ./node_modules
COPY --from=builder /app/api-server/dist ./dist

COPY scraper/requirements.txt ./scraper/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r scraper/requirements.txt
COPY scraper ./scraper

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
