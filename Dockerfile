FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY game.js ./
COPY server.js ./
COPY index.html ./

EXPOSE 10000

CMD ["node", "server.js"]
