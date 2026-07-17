# AgentDuel — x402 arena API (Express). Railway/Render/Fly compatible.
# The server honours $PORT (config.ts: process.env.PORT ?? 8403), so the platform
# can inject the port. Frontend (web/) is deployed separately (Vercel or its own service).
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. tsx is a devDependency and is needed at
# runtime (the server runs via tsx), so we keep dev deps.
COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
# Railway/Render inject $PORT; 8403 is the local default.
EXPOSE 8403

CMD ["npm", "start"]
