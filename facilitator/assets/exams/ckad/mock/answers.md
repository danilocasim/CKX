# CKAD Mock Exam - Answers

## Question 1: Create a deployment called nginx-deployment in the namespace dev with 3 replicas and image nginx:latest

```bash
# Create the namespace if it doesn't exist
kubectl create namespace dev

# Create the deployment with 3 replicas
kubectl create deployment nginx-deployment -n dev --image=nginx:latest --replicas=3
```

## Question 2: Create a ConfigMap and Pod with environment variables and resource limits

```bash
# Create the ConfigMap
kubectl create configmap app-config -n workloads --from-literal=APP_ENV=production --from-literal=LOG_LEVEL=info
```

Create the Pod with ConfigMap environment variables:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: config-pod
  namespace: workloads
spec:
  containers:
    - name: nginx
      image: nginx
      env:
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: APP_ENV
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 200m
          memory: 256Mi
```

Save as `config-pod.yaml` and apply:

```bash
kubectl apply -f config-pod.yaml
```

## Question 3: Create a NetworkPolicy named 'allow-traffic'

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-traffic
  namespace: networking
spec:
  podSelector:
    matchLabels:
      app: web
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: frontend
      ports:
        - protocol: TCP
          port: 80
```

Save as `network-policy.yaml` and apply:

```bash
kubectl apply -f network-policy.yaml
```

## Question 4: Create a Deployment and Service

```bash
# Create namespace
kubectl create namespace pod-design

# Create deployment and service
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: pod-design
  labels:
    app: frontend
    tier: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
      tier: frontend
  template:
    metadata:
      labels:
        app: frontend
        tier: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:1.19.0
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
  namespace: pod-design
spec:
  selector:
    app: frontend
    tier: frontend
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
EOF
```

## Question 5: Create a Pod with Probes and Resource Limits

```bash
# Create namespace
kubectl create namespace observability

# Create pod with probes and resource limits
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: probes-pod
  namespace: observability
spec:
  containers:
  - name: nginx
    image: nginx
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
    livenessProbe:
      httpGet:
        path: /healthz
        port: 80
      initialDelaySeconds: 10
      periodSeconds: 5
    readinessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 3
EOF
```
