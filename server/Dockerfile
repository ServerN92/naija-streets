# Naija Streets game server: Node 22 and our own code, nothing from npm
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.js"]
