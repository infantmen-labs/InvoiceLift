# Backend Dockerfile
# Use Debian-based Node to avoid better-sqlite3 alpine build issues
FROM node:18-bullseye-slim AS base
WORKDIR /app

# Install build tools for native deps (better-sqlite3)
RUN apt-get update -y && apt-get install -y python3 g++ make && rm -rf /var/lib/apt/lists/*

# Copy backend package and lock, then install
COPY backend/package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY backend/ ./
RUN npm run build

# Runtime image
FROM node:18-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules and dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/.env.example ./

# Expose port and run
EXPOSE 8080
CMD ["node", "dist/index.js"]
