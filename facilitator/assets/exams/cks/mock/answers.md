# CKS Mock Exam - Answers

## Question 1: Network Policies for Backend Services

Create a NetworkPolicy that restricts access to backend pods and controls their egress:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: secure-backend
  namespace: network-security
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - port: 5432
```

This NetworkPolicy ensures:
- Only pods with label `app=frontend` can access backend pods on port 8080
- Backend pods can only communicate with pods labeled `app=database` on port 5432

## Question 2: RBAC with Minimal Permissions

Create Role and RoleBinding for minimal access:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-reader-role
  namespace: rbac-minimize
rules:
- apiGroups: [""]
  resources: ["pods", "services"]
  verbs: ["get", "watch", "list"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "watch", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-reader-binding
  namespace: rbac-minimize
subjects:
- kind: ServiceAccount
  name: app-reader
  namespace: rbac-minimize
roleRef:
  kind: Role
  name: app-reader-role
  apiGroup: rbac.authorization.k8s.io
```

## Question 3: Pod Security Standards

Apply Pod Security Standards:

```bash
# Label the namespace
kubectl label namespace pod-security pod-security.kubernetes.io/enforce=baseline
```

Create a compliant pod:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: compliant-pod
  namespace: pod-security
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
  containers:
  - name: nginx
    image: nginx
    securityContext:
      allowPrivilegeEscalation: false
```

Try to create a non-compliant pod and document the error:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: non-compliant-pod
  namespace: pod-security
spec:
  containers:
  - name: nginx
    image: nginx
    securityContext:
      privileged: true
```

Save the error to `/tmp/violation.txt`:

```bash
kubectl apply -f non-compliant-pod.yaml 2> /tmp/violation.txt || true
```
