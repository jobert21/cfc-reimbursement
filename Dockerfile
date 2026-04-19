FROM node:20-alpine AS angular-build

WORKDIR /app/angular

COPY angular/package*.json ./
RUN npm ci

COPY angular/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY nodejs-api/package*.json ./
RUN npm ci --omit=dev

COPY nodejs-api/ ./
COPY --from=angular-build /app/angular/dist/angular/ ./public/

EXPOSE 3001

CMD ["npm", "start"]
