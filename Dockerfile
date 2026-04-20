FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

# Create data and logs directories
RUN mkdir -p data logs

# Expose default port
EXPOSE 7810

# Default: server mode. Override with --mode cli
ENV BUN_ENV=production
ENTRYPOINT ["bun", "run", "src/index.ts"]
CMD ["--mode", "server"]
