FROM node:14

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

ENV PORT = 3333

EXPOSE 8080

CMD ["npm", "start"]
