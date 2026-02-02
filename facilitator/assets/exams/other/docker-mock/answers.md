# Docker Mock Exam - Answers

## Question 1: Run a container with specific parameters

**Task**: Run a container using nginx:alpine with specific parameters.

**Solution**:

```bash
docker run -d --name web-server -p 8080:80 -e NGINX_HOST=localhost nginx:alpine

# Verify the container is running
docker ps | grep web-server

# Verify environment variable
docker exec web-server env | grep NGINX_HOST
```

## Question 2: Create and use a Docker volume

**Task**: Create a Docker volume and use it in a container to persist data.

**Solution**:

```bash
# Create the volume
docker volume create data-volume

# Run a container that mounts the volume and creates a file
docker run --name volume-test -v data-volume:/app/data alpine:latest sh -c "mkdir -p /app/data && echo 'Docker volumes test' > /app/data/test.txt"

# Verify the data was persisted
docker run --rm -v data-volume:/app/data alpine:latest cat /app/data/test.txt
```

## Question 3: Create a custom network and use container DNS

**Task**: Create a custom bridge network and test container DNS resolution.

**Solution**:

```bash
# Create the custom network
docker network create --subnet=172.18.0.0/16 app-network

# Run the first container in detached mode
docker run -d --name app1 --network app-network alpine sleep 1000

# Run the second container to ping the first one
docker run --name app2 --network app-network alpine ping -c 3 app1

# Verify the containers used the correct network
docker network inspect app-network
```
