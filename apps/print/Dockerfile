# Optional print service. Ghostscript is AGPL: it is installed here, in its own container,
# and only ever run as a CLI process. Build context: apps/print.
FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ghostscript \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Node 22 strips TypeScript types natively, so there is no build step (the sources use erasable syntax only).
CMD ["node", "--experimental-strip-types", "src/server.ts"]
