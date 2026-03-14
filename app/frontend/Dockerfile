# Stage 1: Build SPA
# REGISTRY is passed by CI as the ECR pull-through cache base URL.
# Example: 123456789.dkr.ecr.us-east-1.amazonaws.com
# Images sourced via ecr-public pull-through cache (public.ecr.aws/docker/library) — no credentials needed.
ARG REGISTRY
FROM ${REGISTRY}/ecr-public/docker/library/node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
ARG REGISTRY
FROM ${REGISTRY}/ecr-public/docker/library/nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check file (nginx serves /health via config)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
