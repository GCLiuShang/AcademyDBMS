ARG NODE_IMAGE=node:20-alpine

FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix ./client ci

COPY client ./client
RUN npm --prefix ./client run build

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix ./server ci --omit=dev

COPY server ./server

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production

WORKDIR /app/server

COPY --from=build --chown=node:node /app/server /app/server
COPY --from=build --chown=node:node /app/client/dist /app/client/dist

USER node

EXPOSE 3001

CMD ["node", "index.js"]
