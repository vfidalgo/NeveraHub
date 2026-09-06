FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --omit=dev

# Copiar aplicación
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Puerto y variables
ENV PORT=3030
EXPOSE 3030

# Iniciar servidor
CMD ["node", "server/server.js"]
