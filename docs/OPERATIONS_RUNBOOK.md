# Operations Runbook - Pardon Simulator

## Quick Reference

### Emergency Contacts
- DevOps Lead: [Your Email]
- AWS Account ID: 640080112933
- Region: us-east-1

### Critical URLs
- Production: https://pardonsimulator.com
- ECS Console: https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/pardon-production-cluster
- CloudWatch Dashboard: [Set after deployment]
- RDS Console: https://console.aws.amazon.com/rds/home?region=us-east-1

## Common Operations

### Check System Health

```bash
# Pool health
curl https://pardonsimulator.com/api/cron/pool-health

# ECS service status
aws ecs describe-services \
  --cluster pardon-production-cluster \
  --services pardon-production-service \
  --query "services[0].[runningCount,desiredCount,deployments]"

# Database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

### Deploy New Version

```bash
# 1. Build and push images
cd /path/to/pardon-simulator
./scripts/build-and-push.sh

# 2. Update ECS service
./scripts/deploy-ecs.sh

# 3. Monitor deployment
aws ecs describe-services \
  --cluster pardon-production-cluster \
  --services pardon-production-service \
  --query "services[0].events[0:5]"

# 4. Watch for errors in logs
aws logs tail /ecs/pardon-production --follow --filter-pattern "ERROR"
```

### Rollback Deployment

```bash
# Emergency rollback to previous task definition
./scripts/rollback.sh prod

# Verify rollback completed
aws ecs describe-services \
  --cluster pardon-production-cluster \
  --services pardon-production-service
```

### Scale Manually

```bash
# Scale up to handle traffic spike
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --desired-count 8

# Scale down during low traffic
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --desired-count 3
```

### Update Secrets

```bash
# Update secrets from .env.secrets file
./scripts/update-secrets.sh prod

# Force ECS tasks to restart and pick up new secrets
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --force-new-deployment
```

### Database Operations

```bash
# Run migrations
cd website
DATABASE_URL=$PRODUCTION_DATABASE_URL npx prisma migrate deploy

# Create database backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Find slow queries
psql $DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

## Incident Response

### Incident Severity Levels

- **P1 (Critical)**: Complete service outage, all users affected
- **P2 (High)**: Partial outage, significant user impact
- **P3 (Medium)**: Degraded performance, some users affected
- **P4 (Low)**: Minor issue, minimal user impact

### P1: Complete Service Outage

**Symptoms**: 503 errors, no ECS tasks running, ALB unhealthy

**Response**:
1. Check ECS service status
2. Check CloudWatch alarms
3. Review recent deployments
4. Rollback if caused by recent deployment
5. Check AWS service health dashboard
6. Scale up manually if auto-scaling failed
7. Notify stakeholders

**Commands**:
```bash
# Check if any tasks are running
aws ecs list-tasks --cluster pardon-production-cluster

# Force new deployment
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --force-new-deployment

# Or rollback
./scripts/rollback.sh prod
```

### P2: High Error Rate

**Symptoms**: >5% 5XX error rate, some users experiencing failures

**Response**:
1. Check CloudWatch metrics for error patterns
2. Review application logs
3. Check database connections
4. Check pool health
5. Run thread cleanup manually
6. Scale up if needed
7. Consider rollback if recent deployment

**Commands**:
```bash
# Check error rate
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Check recent errors in logs
aws logs tail /ecs/pardon-production \
  --since 30m \
  --filter-pattern "ERROR" \
  --format short

# Force thread cleanup
curl https://pardonsimulator.com/api/cron/thread-cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

### P3: High Latency

**Symptoms**: P95 > 5s, users reporting slow responses

**Response**:
1. Check pool health for overloaded pools
2. Check database slow queries
3. Check ECS CPU/Memory metrics
4. Scale up ECS tasks
5. Check Coral Server performance
6. Review recent code changes

**Commands**:
```bash
# Check pool health
curl https://pardonsimulator.com/api/cron/pool-health

# Check ECS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=pardon-production-service Name=ClusterName,Value=pardon-production-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Scale up
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --desired-count 7
```

### P4: Unhealthy Pool

**Symptoms**: One or two pools showing unhealthy in pool-health endpoint

**Response**:
1. Check thread count in affected pools
2. Run session cleanup
3. Run thread cleanup
4. Monitor for improvement
5. If persistent, restart ECS tasks

**Commands**:
```bash
# Check pool health
curl https://pardonsimulator.com/api/cron/pool-health | jq .

# Force cleanup
curl https://pardonsimulator.com/api/cron/session-cleanup \
  -H "Authorization: Bearer $CRON_SECRET"

curl https://pardonsimulator.com/api/cron/thread-cleanup \
  -H "Authorization: Bearer $CRON_SECRET"

# Check database for stuck sessions
psql $DATABASE_URL -c "
  SELECT coralSessionId, COUNT(*) as thread_count
  FROM \"Thread\" t
  JOIN \"Session\" s ON t.\"sessionId\" = s.id
  WHERE s.\"endTime\" IS NULL
  GROUP BY coralSessionId
  ORDER BY thread_count DESC;
"
```

## Monitoring

### Key Metrics to Watch

1. **ECS Service**
   - Running task count
   - CPU utilization (target: <70%)
   - Memory utilization (target: <80%)
   - Deployment status

2. **ALB**
   - Request count
   - Response time (P95 < 3s)
   - Error rate (<1%)
   - Healthy target count

3. **RDS**
   - CPU utilization (<80%)
   - Database connections
   - Free storage space
   - Replica lag

4. **Application**
   - Active sessions per pool
   - Active threads per pool
   - Pool health status
   - Session expiration rate

### Setting Up Alerts

```bash
# Subscribe to SNS topic for alarms
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:640080112933:pardon-production-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com
```

## Maintenance Tasks

### Daily
- [ ] Check CloudWatch dashboard
- [ ] Review alarm history
- [ ] Check pool health
- [ ] Review error logs

### Weekly
- [ ] Review cost metrics
- [ ] Check database performance
- [ ] Review slow queries
- [ ] Check storage growth
- [ ] Review security logs

### Monthly
- [ ] Run load tests
- [ ] Capacity planning review
- [ ] Test backup restoration
- [ ] Security updates
- [ ] Performance optimization

### Quarterly
- [ ] Disaster recovery test
- [ ] Cost optimization review
- [ ] Security audit
- [ ] Update documentation

## Useful Commands

### ECS

```bash
# List running tasks
aws ecs list-tasks --cluster pardon-production-cluster

# Get task details
aws ecs describe-tasks \
  --cluster pardon-production-cluster \
  --tasks TASK_ARN

# Stop a specific task (force restart)
aws ecs stop-task \
  --cluster pardon-production-cluster \
  --task TASK_ARN \
  --reason "Manual restart"

# Update service with new task definition
aws ecs update-service \
  --cluster pardon-production-cluster \
  --service pardon-production-service \
  --task-definition pardon-production-task:NEW_REVISION
```

### CloudWatch Logs

```bash
# Tail logs
aws logs tail /ecs/pardon-production --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/pardon-production \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '1 hour ago' +%s)000

# Get logs for specific task
aws logs tail /ecs/pardon-production \
  --follow \
  --filter-pattern "TASK_ID"
```

### Database

```bash
# Connect to production database
psql $DATABASE_URL

# Check active connections
psql $DATABASE_URL -c "
  SELECT count(*), state
  FROM pg_stat_activity
  GROUP BY state;
"

# Kill idle connections
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND state_change < now() - interval '1 hour';
"

# Vacuum and analyze
psql $DATABASE_URL -c "VACUUM ANALYZE;"
```

## Cost Optimization

### Current Cost Breakdown

- ECS Fargate: $30-420/month (depending on scale)
- ALB: $16/month
- RDS: $100/month
- CloudWatch: $10/month
- Data Transfer: $5-20/month

**Total**: $161-566/month

### Optimization Tips

1. **Use Fargate Spot** for non-production environments
2. **Schedule downtime** for dev/test environments
3. **Optimize RDS instance size** based on actual usage
4. **Use CloudWatch Logs retention** policies
5. **Enable S3 lifecycle policies** for backups
6. **Review and remove unused resources**

### Cost Monitoring

```bash
# Get current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

## Security

### Access Control

- Use IAM roles, never access keys
- Enable MFA for AWS console access
- Use AWS Secrets Manager for all secrets
- Rotate secrets every 90 days
- Use security groups with least privilege

### Security Checklist

- [ ] All ECS tasks use latest base images
- [ ] All secrets in Secrets Manager
- [ ] RDS encryption enabled
- [ ] CloudTrail logging enabled
- [ ] VPC Flow Logs enabled
- [ ] Security groups follow least privilege
- [ ] No public access to RDS
- [ ] SSL/TLS for all external communication

## Disaster Recovery

### Backup Strategy

- **RDS**: Automated daily backups (7-day retention)
- **Snapshots**: Manual snapshots before major changes
- **Code**: Git repository (GitHub)
- **Infrastructure**: CloudFormation templates

### Recovery Procedures

**Scenario: Complete region failure**

1. Deploy infrastructure in new region:
   ```bash
   AWS_REGION=us-west-2 ./scripts/deploy-infrastructure.sh prod
   ```

2. Restore database from snapshot
3. Update DNS to point to new ALB
4. Deploy application
5. Verify functionality

**RTO**: 2 hours
**RPO**: 24 hours (last database backup)

## Changelog

### 2024-11-22
- Initial version
- Added scaling architecture
- Added operational procedures
- Added incident response playbook

---

*For questions or updates, contact DevOps team*




