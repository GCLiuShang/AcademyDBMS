ARG NODE_IMAGE=node:20-alpine

FROM ${NODE_IMAGE} AS builder

ARG http_proxy
ARG https_proxy
ARG no_proxy
ENV http_proxy=$http_proxy https_proxy=$https_proxy no_proxy=$no_proxy

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY client/package.json client/package-lock.json ./client/
RUN npm ci --prefix client
COPY client/ ./client/
RUN npm run build --prefix client

FROM ${NODE_IMAGE}

ARG http_proxy
ARG https_proxy
ARG no_proxy
ENV http_proxy=$http_proxy https_proxy=$https_proxy no_proxy=$no_proxy

WORKDIR /app

RUN apk add --no-cache tini
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

COPY docker/wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it.sh

ENV NODE_ENV=production
USER appuser

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "wait-for-it.sh db:3306 -t 60 -- node server/index.js"]