FROM node:22.22.3-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
USER node
ENV NODE_ENV=production
EXPOSE 8789
CMD ["node", "src/api.mjs"]
