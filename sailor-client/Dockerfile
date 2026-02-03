FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (use npm install since package-lock.json may not exist yet)
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose port
EXPOSE 4000

# Start application
CMD ["node", "src/app.js"]
