# Pardon Simulator - Scaling Architecture

## Current Production Architecture

**Status:** Production currently uses a **simplified single-session architecture** for stability.
- Single ECS task with one Coral session (`production-main`)
- 6 AI agents (trump-donald, trump-melania, trump-eric, trump-donjr, trump-barron, cz)
- Designed for stability and ease of management
- Suitable for current user load

**This document describes the advanced multi-pool scaling architecture** for future expansion to 100+ concurrent users.

## Overview (Future Scaling Design)

This document describes a future scaling architecture for supporting 100+ concurrent users with high performance and reliability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────┐
          │  Application Load         │
          │  Balancer (ALB)          │
          │  - SSL Termination       │
          │  - Health Checks         │
          └────────────┬─────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
┌─────────────────┐          ┌─────────────────┐
│  ECS Task 1     │          │  ECS Task 2-10  │
│  (Auto-Scaled)  │   ...    │  (Auto-Scaled)  │
├─────────────────┤          ├─────────────────┤
│ Coral Server    │          │ Coral Server    │
│ - pool-0        │          │ - pool-0        │
│ - pool-1        │          │ - pool-1        │
│ - pool-2        │          │ - pool-2        │
│ - pool-3        │          │ - pool-3        │
│ - pool-4        │          │ - pool-4        │
├─────────────────┤          ├─────────────────┤
│ 6 AI Agents     │          │ 6 AI Agents     │
│ - trump-donald  │          │ - trump-donald  │
│ - trump-melania │          │ - trump-melania │
│ - trump-eric    │          │ - trump-eric    │
│ - trump-donjr   │          │ - trump-donjr   │
│ - trump-barron  │          │ - trump-barron  │
│ - cz            │          │ - cz            │
└────────┬────────┘          └────────┬────────┘
         │                            │
         └────────────┬───────────────┘
                      │
         ┌────────────▼────────────┐
         │   RDS PostgreSQL        │
         │   - Primary (Multi-AZ)  │
         │   - Read Replica        │
         └─────────────────────────┘
```

## Key Components

### 1. Session Pooling

**Purpose**: Distribute user load across 5 Coral sessions to prevent resource exhaustion.

**Implementation** (Future):
- Each ECS task runs a single Coral Server instance
- Coral Server hosts 5 session pools: `pool-0` through `pool-4`
- All 6 agents connect to all 5 pools simultaneously
- Users are assigned to pools using consistent hashing (based on wallet address)
- Each pool can handle ~30-40 concurrent threads

**Current Production** uses single session without pooling for simplicity and stability.

**Benefits**:
- 5x capacity increase (from ~20 to ~100-200 users)
- Consistent user experience (same pool on return visits)
- Simple to implement and monitor
- No dynamic agent spawning needed

### 2. Auto-Scaling ECS Fargate

**Configuration**:
- **Minimum**: 3 tasks (high availability)
- **Maximum**: 10 tasks (cost control)
- **Scale-out trigger**: CPU > 70% for 2 minutes
- **Scale-in trigger**: CPU < 30% for 5 minutes

**Resource Allocation per Task**:
- **CPU**: 2 vCPUs
- **Memory**: 8 GB
- **Containers**: 8 total (1 Coral Server + 7 agents)

**Cost Estimate**:
- Average: 5-7 tasks running = $210-294/month
- Peak: 10 tasks = $420/month
- Cost per user: $0.80-3.00/month

### 3. Application Load Balancer

**Features**:
- SSL termination with ACM certificate
- Health checks on Coral Server `/health` endpoint
- Sticky sessions (1-hour cookie)
- HTTP → HTTPS redirect
- Target group with ECS service integration

**Benefits**:
- Zero-downtime deployments
- Automatic failover to healthy tasks
- SSL offloading from application
- Centralized traffic management

### 4. RDS PostgreSQL

**Configuration**:
- **Instance**: db.t3.medium (2 vCPU, 4 GB RAM)
- **Storage**: 20 GB GP3 (expandable)
- **Multi-AZ**: Enabled for primary
- **Read Replica**: For analytics/leaderboard queries
- **Backups**: 7-day retention
- **Encryption**: At-rest encryption enabled

**Connection Management**:
- Connection pooling via Prisma
- Separate read/write connections
- Connection limits per environment
- Automatic retry with exponential backoff

### 5. Session Lifecycle Management

**Automatic Cleanup**:
- **Session Expiration**: Sessions inactive for 60 minutes are expired
- **Thread Cleanup**: Orphaned Coral threads are closed every 30 minutes
- **Pool Health Monitoring**: Health checked every 5 minutes

**Cron Jobs** (Vercel):
- `/api/cron/session-cleanup` - Every 15 minutes
- `/api/cron/thread-cleanup` - Every 30 minutes
- `/api/cron/pool-health` - Every 5 minutes

### 6. Monitoring & Observability

**CloudWatch Dashboard**:
- ECS CPU and memory utilization
- ALB response times (p95, p99)
- HTTP request counts and error rates
- Running task count
- RDS metrics (CPU, connections, memory)

**Alarms** (with SNS notifications):
- High CPU (>80%)
- High memory (>85%)
- Unhealthy ALB targets
- High 5XX error rate
- RDS high CPU
- RDS low storage

**Custom Metrics**:
- Active threads per pool
- Active sessions per pool
- Pool health status
- Payment volume

### 7. Security

**Network Security**:
- ECS tasks in private subnets (no public IPs)
- ALB in public subnets
- Security groups with least privilege
- RDS not publicly accessible

**Secrets Management**:
- AWS Secrets Manager for all secrets
- No secrets in code or environment variables
- ECS tasks pull secrets at runtime
- Secrets rotation policy (90 days)

**IAM Roles**:
- ECS Task Execution Role: Pull images, read secrets, write logs
- ECS Task Role: CloudWatch metrics, RDS access
- Separate roles per environment

## Scaling Strategy

### Horizontal Scaling

**Current Capacity**:
- 1 ECS task = 5 pools × 30 threads = ~150 users
- 3 ECS tasks (minimum) = ~450 users capacity
- 10 ECS tasks (maximum) = ~1,500 users capacity

**Scaling Triggers**:
- Auto-scaling based on CPU utilization
- Manual scaling for planned events
- CloudWatch alarms notify before capacity issues

### Vertical Scaling

**If needed**:
- Increase ECS task resources (4 vCPUs, 16 GB RAM)
- Upgrade RDS instance class (db.t3.large)
- Increase pool count (pool-0 through pool-9)

## Deployment Process

### 1. Infrastructure Deployment

```bash
# Deploy all AWS infrastructure
./scripts/deploy-infrastructure.sh prod your-email@example.com

# Update secrets
./scripts/update-secrets.sh prod

# Migrate database to RDS
./scripts/migrate-to-rds.sh prod

# Deploy monitoring
./scripts/setup-monitoring.sh prod your-email@example.com
```

### 2. Application Deployment

```bash
# Build and push Docker images
./scripts/build-and-push.sh

# Deploy to ECS
./scripts/deploy-ecs.sh

# Wait for deployment to complete
# Monitor in ECS console
```

### 3. Verification

```bash
# Check pool health
curl https://pardonsimulator.com/api/cron/pool-health

# Run smoke tests
cd website && npm test

# Monitor CloudWatch dashboard
# Check ECS service running count
# Verify ALB target health
```

### 4. Rollback (if needed)

```bash
# Rollback to previous task definition
./scripts/rollback.sh prod
```

## Operational Runbook

### Daily Operations

1. **Monitor CloudWatch Dashboard**
   - Check for anomalies in metrics
   - Review alarm history

2. **Check Pool Health**
   - Verify all pools are healthy
   - Check thread distribution

3. **Review Logs**
   - Check for errors in CloudWatch Logs
   - Monitor agent performance

### Weekly Tasks

1. **Review Cost Metrics**
   - Check AWS Cost Explorer
   - Analyze scaling patterns
   - Optimize resource allocation

2. **Database Maintenance**
   - Review slow queries
   - Check connection pool usage
   - Monitor storage growth

3. **Security Review**
   - Check for security advisories
   - Review IAM access patterns
   - Verify secrets rotation

### Monthly Tasks

1. **Performance Testing**
   - Run load tests
   - Compare against baseline
   - Identify optimization opportunities

2. **Capacity Planning**
   - Review growth trends
   - Adjust auto-scaling limits
   - Plan for peak events

3. **Backup Testing**
   - Verify RDS snapshots
   - Test restore procedure
   - Document recovery time

## Troubleshooting

### Issue: Users seeing "session not ready" errors

**Cause**: Agents not connected to all pools

**Solution**:
1. Check ECS task logs
2. Verify `CORAL_SESSIONS` environment variable
3. Restart ECS tasks if needed

### Issue: High latency (>3s response time)

**Cause**: Pool overload or database bottleneck

**Solution**:
1. Check pool health: `curl /api/cron/pool-health`
2. Review CloudWatch metrics
3. Increase ECS task count manually if needed
4. Check database connections and slow queries

### Issue: All pools showing unhealthy

**Cause**: Thread cleanup not working or very high load

**Solution**:
1. Run manual cleanup: `curl /api/cron/thread-cleanup`
2. Check database for abandoned sessions
3. Review recent activity spikes
4. Consider increasing pool count

### Issue: Auto-scaling not triggering

**Cause**: Metrics not reaching thresholds

**Solution**:
1. Review CPU/Memory metrics in CloudWatch
2. Check if application is bottlenecked elsewhere (e.g., database)
3. Adjust scaling policies if needed
4. Consider custom metric-based scaling

## Performance Benchmarks

### Target Metrics

- **Response Time**: P95 < 3s, P99 < 5s
- **Error Rate**: < 1%
- **Uptime**: 99.9% (43 minutes downtime/month)
- **Concurrent Users**: 100-200
- **Cost per User**: < $3/month

### Load Test Results

(To be filled in after running load tests)

```bash
# Run load test
./scripts/run-load-test.sh https://pardonsimulator.com

# Review results in reports/load-tests/
```

## Future Enhancements

### Short-term (Q1 2025)

- Automated secret rotation
- Enhanced monitoring with custom metrics
- Cost optimization review
- Blue-green deployment automation

### Long-term (Q2 2025)

- Multi-region deployment
- Disaster recovery automation
- Advanced caching (Redis/ElastiCache)
- Per-user session isolation (if needed)

## References

- [AWS ECS Fargate Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [RDS PostgreSQL Performance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [CloudFormation Templates](../aws/cloudformation/)
- [Deployment Scripts](../scripts/)
- [Load Testing Configuration](../tests/load/)

## Support

For issues or questions:
1. Check this documentation
2. Review CloudWatch logs
3. Check ECS task health
4. Contact DevOps team

---

*Last Updated: November 2024*
*Version: 1.0*





