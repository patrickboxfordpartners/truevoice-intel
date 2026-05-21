FROM node:22-slim AS builder

WORKDIR /app

COPY monitor/package*.json ./
RUN npm install

COPY monitor .

ARG VITE_API_URL=https://api.truevoicehq.com
ARG BASE_PATH=/
ARG PORT=5173

ENV VITE_API_URL=$VITE_API_URL
ENV BASE_PATH=$BASE_PATH
ENV PORT=$PORT

RUN npm run build

FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY monitor/server.mjs ./

ENV PORT=5173
EXPOSE 5173

CMD ["node", "server.mjs"]
