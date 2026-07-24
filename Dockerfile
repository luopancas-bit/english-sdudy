FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
RUN groupadd --gid 10001 zhuguang \
  && useradd --uid 10001 --gid zhuguang --home-dir /app --shell /usr/sbin/nologin zhuguang
COPY --from=build --chown=zhuguang:zhuguang /app/node_modules ./node_modules
COPY --from=build --chown=zhuguang:zhuguang /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=zhuguang:zhuguang /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=zhuguang:zhuguang /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=zhuguang:zhuguang /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=zhuguang:zhuguang /app/packages ./packages
COPY --from=build --chown=zhuguang:zhuguang /app/package.json ./package.json
USER zhuguang
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
