# vsrp-sandbox backend: Node + Express, proxies public APIs
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

# Run as non-root for security hardening
USER node

EXPOSE 3000
CMD ["node", "index.js"]
