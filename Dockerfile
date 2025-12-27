FROM node:20-alpine AS build

WORKDIR /app

COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix ./client ci

COPY client ./client
RUN npm --prefix ./client run build

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix ./server ci --omit=dev

COPY server ./server

FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app/server

COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist

EXPOSE 3001

CMD ["node", "index.js"]
