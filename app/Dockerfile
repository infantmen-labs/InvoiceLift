# Frontend (Vite) Dockerfile
FROM node:18-bullseye-slim AS builder
WORKDIR /app

COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM node:18-bullseye-slim AS runner
WORKDIR /app
# Copy entire app to use vite preview (dev dependency)
COPY --from=builder /app ./
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
