# sentinelCYBER web demo — no external deps, pure Node built-ins + global fetch.
FROM node:22-slim
WORKDIR /app
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "web/server.js"]
