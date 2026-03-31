# ── Stage: Base image ──────────────────────────────────────────────────────
FROM node:20-alpine

# ── Stage: Working directory ────────────────────────────────────────────────
WORKDIR /app

# ── Stage: Dependencies ─────────────────────────────────────────────────────
COPY package*.json ./
RUN npm install

# ── Stage: Application code ─────────────────────────────────────────────────
COPY . .

# ── Stage: Runtime config ───────────────────────────────────────────────────
EXPOSE 5001
CMD ["node", "server.js"]
