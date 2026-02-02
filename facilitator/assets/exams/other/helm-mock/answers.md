# Helm Mock Exam - Answers

## Question 1: Add Bitnami Chart Repository

**Task**: Add the Bitnami Helm repository and update it.

**Solution**:

```bash
# Add Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami

# Update repo to fetch the latest chart information
helm repo update

# Verify by listing repositories
helm repo list
```

## Question 2: Install Nginx Chart with Custom Configuration

**Task**: Install nginx chart with custom service configuration.

**Solution**:

```bash
# Install nginx chart with custom service configuration
helm install web-server bitnami/nginx \
  --set service.type=NodePort \
  --set service.nodePorts.http=30080
```

## Question 3: Upgrade Release with New Replica Count

**Task**: Upgrade the release to set 3 replicas.

**Solution**:

```bash
# Upgrade the release to set 3 replicas
helm upgrade web-server bitnami/nginx --set replicaCount=3

# Verify the update
kubectl get pods -l app.kubernetes.io/instance=web-server
```
