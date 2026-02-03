FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the application files
COPY server.js ./
COPY services/ ./services/
COPY public/ ./public/
COPY client/ ./client/

# Build React SPA (outputs to public/dist)
RUN cd client && npm ci && npm run build

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"] 