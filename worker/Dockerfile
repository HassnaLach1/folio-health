FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/domain.ts ./src/domain.ts
COPY worker ./worker
RUN mkdir -p .cache/ocr-language && chown -R node:node /app
USER node
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "worker/index.ts"]
