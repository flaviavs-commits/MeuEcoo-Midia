FROM node:24-alpine

WORKDIR /app

# O container de produção nunca deve herdar o fallback de desenvolvimento do
# código caso a plataforma não injete NODE_ENV automaticamente.
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
