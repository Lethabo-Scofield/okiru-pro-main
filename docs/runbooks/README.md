# Okiru Pro Runbooks

This directory contains operational runbooks for common issues and procedures.

## Available Runbooks

| Runbook | Purpose |
|---------|---------|
| [MongoDB Connection Failures](mongodb-connection-failures.md) | Diagnose and fix MongoDB connectivity issues |
| [Deployment Failures](deployment-failures.md) | Resolve Kubernetes deployment issues |
| [Enable NetworkPolicies](enable-network-policies.md) | Safely roll out NetworkPolicies without breaking connectivity |

## Quick Reference

### Emergency Commands

```bash
# Check all pod status
kubectl get pods -n okiru-pro

# View recent events
kubectl get events -n okiru-pro --sort-by=.metadata.creationTimestamp | tail -20

# Check logs for specific app
kubectl logs -n okiru-pro -l app=api --tail=100

# Rollback failed deployment
kubectl rollout undo deployment/api -n okiru-pro

# Scale down/up to restart
kubectl scale deployment api --replicas=0 -n okiru-pro
kubectl scale deployment api --replicas=2 -n okiru-pro
```

### Useful Aliases

Add to your shell profile:

```bash
alias k='kubectl'
alias kgp='kubectl get pods -n okiru-pro'
alias kga='kubectl get all -n okiru-pro'
alias kl='kubectl logs -n okiru-pro'
alias kdesc='kubectl describe -n okiru-pro'
alias ktail='kubectl logs -n okiru-pro --tail=100 -f'
```

### Contact

- Primary: Platform Team
- Escalation: DevOps Lead
- Emergency: Azure Support (for infrastructure issues)
