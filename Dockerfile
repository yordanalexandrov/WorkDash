# Base images pinned by digest so a rebuild of the same commit starts from the same bytes; Dependabot bumps them.
FROM node:26-bookworm@sha256:fa52d1669505e29b58c042875b1d65c229e0787a3610fd52869b22b68e480853 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev

FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9
# The commit the image is built from (scripts/deploy.ts), checked against the running container after a deploy.
ARG REVISION=unknown
LABEL org.opencontainers.image.revision=$REVISION
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/public ./web/public
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
