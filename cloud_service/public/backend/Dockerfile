FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY keys ./keys

EXPOSE 4003

CMD ["npm", "start"]