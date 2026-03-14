# vsrp-sandbox backend: Node + Express, proxies public APIs
# REGISTRY is passed by CI as the ECR pull-through cache base URL.
# Example: 123456789.dkr.ecr.us-east-1.amazonaws.com
# Image sourced via ecr-public pull-through cache (public.ecr.aws/docker/library) — no credentials needed.
ARG REGISTRY
FROM ${REGISTRY}/ecr-public/docker/library/node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

# Run as non-root for security hardening
USER node

EXPOSE 3000
CMD ["node", "index.js"]
