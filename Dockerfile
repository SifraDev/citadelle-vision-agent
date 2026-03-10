FROM mcr.microsoft.com/playwright:jammy

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]
