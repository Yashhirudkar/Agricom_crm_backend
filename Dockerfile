# Base Image
FROM node:22-alpine

# Container ke andar working directory
WORKDIR /app

# Package files copy karo
COPY package*.json ./

# Dependencies install karo
RUN npm install

# Project ki baki files copy karo
COPY . .

# NestJS build karo
RUN npm run build

# Application port
EXPOSE 5000

# Container start hone par ye command chalegi
CMD ["npm", "run", "start:prod"]