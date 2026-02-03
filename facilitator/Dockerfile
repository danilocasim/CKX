FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies and SSH client for connecting to jumphost
RUN apk add --no-cache openssh-client

# Install dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create a non-root user and switch to it
# Note: Docker socket access requires docker group membership
# The docker group GID will be set via docker-compose user override
# We create the docker group here, but the actual GID will match the host's docker group
RUN addgroup -g 1001 -S nodejs && \
    addgroup -g 995 -S docker || addgroup -g 999 -S docker || true && \
    adduser -S nodeuser -u 1001 -G nodejs && \
    adduser nodeuser docker || true

# Setup SSH for passwordless authentication
RUN mkdir -p /home/nodeuser/.ssh && \
    chmod 700 /home/nodeuser/.ssh && \
    echo "Host jumphost\n\tStrictHostKeyChecking no\n\tUserKnownHostsFile /dev/null" > /home/nodeuser/.ssh/config && \
    chmod 600 /home/nodeuser/.ssh/config && \
    chown -R nodeuser:nodejs /home/nodeuser/.ssh

# Change ownership of the app files to the non-root user
RUN chown -R nodeuser:nodejs /usr/src/app

# Expose the service port
EXPOSE 3000

# Copy entrypoint.sh to /usr/src/app
COPY entrypoint.sh /home/nodeuser/entrypoint.sh

# Make entrypoint.sh executable
RUN chmod +x /home/nodeuser/entrypoint.sh

# Switch to non-root user
# Note: For Docker socket access, we may need to run as root or with docker group GID
# This will be handled via docker-compose user override
USER nodeuser

ENTRYPOINT ["/bin/sh", "/home/nodeuser/entrypoint.sh"]