FROM node:22-alpine AS build
RUN apk add --no-cache build-base g++ cairo-dev pango-dev giflib-dev libjpeg-turbo-dev
WORKDIR /build
COPY . .
RUN npm ci && \
    npm run build && \
    npm run reset && \
    npm -w backend ci --omit=dev

FROM node:22-alpine AS sync-in
RUN apk add --no-cache cairo-dev pango-dev giflib-dev libjpeg-turbo-dev fontconfig ttf-liberation su-exec && \
    mkdir -p /app/data /app/environment
WORKDIR /app
COPY --from=build --chown=8888:8888 /build/LICENSE .
COPY --from=build --chown=8888:8888 /build/dist/ .
COPY --from=build --chown=8888:8888 /build/node_modules ./node_modules
COPY --from=build --chown=8888:8888 /build/backend/migrations ./migrations
COPY --from=build --chown=8888:8888 /build/environment/environment.dist.yaml ./environment/environment.dist.yaml
COPY --from=build --chown=8888:8888 --chmod=755 /build/scripts/docker-sync-in-server.sh ./sync-in-server.sh
COPY --from=build --chown=8888:8888 --chmod=755 /build/scripts/docker-entrypoint.sh ./entrypoint.sh
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV PUID=8888
ENV PGID=8888
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
CMD ["/bin/sh", "sync-in-server.sh"]