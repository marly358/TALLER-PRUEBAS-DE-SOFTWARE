# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Herramientas de QA: Chromium y su driver proceden del mismo repositorio Debian.
FROM base AS qa
ARG JMETER_VERSION=5.6.3
ARG JMETER_SHA512=5978a1a35edb5a7d428e270564ff49d2b1b257a65e17a759d259a9283fc17093e522fe46f474a043864aea6910683486340706d745fcdf3db1505fd71e689083
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates chromium chromium-driver default-jre-headless curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --retry 3 \
        "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" \
        --output /tmp/jmeter.tgz \
    && echo "${JMETER_SHA512}  /tmp/jmeter.tgz" | sha512sum --check - \
    && tar -xzf /tmp/jmeter.tgz -C /opt \
    && mv "/opt/apache-jmeter-${JMETER_VERSION}" /opt/jmeter \
    && rm /tmp/jmeter.tgz
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci && npm cache clean --force
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
COPY --chown=node:node api_tests ./api_tests
COPY --chown=node:node ui_tests ./ui_tests
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node performance ./performance
RUN mkdir -p /app/artifacts /app/performance/results \
    && chown node:node /app/artifacts /app/performance/results
ENV NODE_ENV=test \
    HEADLESS=true \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_BIN=/usr/bin/chromedriver \
    CHROME_NO_SANDBOX=true \
    JMETER_BIN=/opt/jmeter/bin/jmeter \
    HEAP="-Xms256m -Xmx1g" \
    JVM_ARGS="-Xss256k -Djava.awt.headless=true"
USER node
CMD ["sh", "-c", "npm run test:all && npm run test:performance"]

# Imagen de la aplicación: solo Node, dependencias del backend e interfaz.
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/app/backend/data/cineflex.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./package.json
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
RUN mkdir -p /app/backend/data && chown node:node /app/backend/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "backend/server.js"]
