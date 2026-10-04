FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install ws
COPY server ./server
COPY client ./client
EXPOSE 10000
CMD ["node","server/server.js"]
