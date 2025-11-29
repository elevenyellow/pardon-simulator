# Security Best Practices

Security guidelines and best practices for Pardon Simulator.

---

## Overview

This guide covers security considerations for running and deploying Pardon Simulator, including API key protection, wallet security, rate limiting, and secure configuration.

---

## API Key Security

### The Risk

API keys must be kept secure to prevent:
- Unauthorized access to services
- Rate limit exhaustion
- Cost overruns
- Service disruption

### Secure Configuration

**Backend Only Variables**

Never use `NEXT_PUBLIC_` prefix for sensitive values:

```bash
# ✅ Correct - Backend only
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
CDP_API_KEY=your_cdp_api_key
CDP_API_SECRET=your_cdp_secret

# ❌ Wrong - Exposed to frontend
NEXT_PUBLIC_SOLANA_RPC_URL=https://.../?api-key=YOUR_KEY
```

**Environment File Structure**

```bash
website/.env.local          # Backend variables (gitignored)
agents/*/.env               # Agent variables (gitignored)
*.example                   # Template files (no real keys)
```

### Architecture

```
Frontend (Browser)
    ↓ No API keys!
Backend API (Next.js)
    ↓ Uses private keys
External Services (RPC providers, LLM APIs, etc.)
```

**Key Points**:
- Frontend never has access to API keys
- Backend acts as secure proxy
- All sensitive operations go through backend
- Wallet operations use wallet's built-in RPC

### Verification

**Check for exposed keys**:
1. Open browser DevTools → Network tab
2. Trigger an API call
3. Verify no API keys appear in requests
4. Only see requests to `/api/*` endpoints

---

## Wallet Security

### User Wallet Security

**Best Practices**:
- Use hardware wallets for large amounts
- Keep seed phrases offline and secure
- Never share private keys
- Verify transaction details before signing
- Check recipient addresses carefully

**What Users Sign**:
- Real Solana transactions (not just messages)
- Transactions transfer actual USDC
- All transactions are irreversible
- Transactions are public on Solana Explorer

### Agent Wallet Security

**Configuration**:
- Agent private keys stored in environment variables
- Never committed to git
- Separate keypair for each agent
- Minimal balance kept (only gas fees)

**Treasury Pattern**:

All user payments automatically forward to a central treasury:

```
User → Agent Wallet → Treasury Wallet
        (0.05 SOL)    (All revenue)
```

**Benefits**:
- Reduced risk (agent wallets hold minimal funds)
- Centralized security (one treasury to secure)
- Easy auditing (all revenue in one place)
- Minimal exposure if agent key compromised

**Setup**:
```bash
# In environment configuration
WALLET_WHITE_HOUSE=your_treasury_address
```

Consider using:
- Hardware wallet for treasury
- Multi-signature wallet (Squads Protocol)
- Cold storage for private key

---

## Rate Limiting

### Protection Against Abuse

Rate limiting prevents:
- DoS attacks
- API abuse
- Resource exhaustion
- Cost overruns

### Rate Limit Tiers

**Strict** (authentication, scoring):
- 10 requests/minute
- For sensitive operations

**Standard** (general APIs):
- 30 requests/minute
- For normal API usage

**Relaxed** (read-only):
- 60 requests/minute
- For data retrieval

**Payment** (transactions):
- 5 requests/5 minutes
- For blockchain operations

### Production Considerations

For production with multiple servers:
- Use Redis for distributed rate limiting
- Implement per-user limits (by wallet address)
- Monitor rate limit hits
- Adjust limits based on usage patterns

---

## Input Validation

### Sanitization

All user input is sanitized before processing:

**Text Sanitization**:
- Remove HTML tags
- Strip null bytes
- Limit length
- Trim whitespace

**Wallet Addresses**:
- Validate Solana address format
- Check base58 encoding
- Verify length (32-44 characters)

**Transaction Signatures**:
- Validate base58 encoding
- Check signature length
- Verify format

**Numeric Values**:
- Validate range
- Check for NaN/Infinity
- Constrain to safe values

### Prevention

Protects against:
- XSS attacks
- SQL injection
- Command injection
- Path traversal
- NoSQL injection

---

## Security Headers

### HTTP Security Headers

Configured in production:

```
Strict-Transport-Security (HSTS)
X-Frame-Options (clickjacking prevention)
X-Content-Type-Options (MIME sniffing prevention)
X-XSS-Protection
Referrer-Policy
Permissions-Policy
Content-Security-Policy (CSP)
```

### Content Security Policy

Restricts:
- Script sources
- Style sources
- Connection sources
- Frame ancestors
- Object sources

---

## CORS Configuration

### Allowed Origins

Configure allowed origins based on environment:

**Development**:
```
http://localhost:3000
http://localhost:3001
```

**Production**:
```
https://your-domain.com
https://www.your-domain.com
```

**Setup**:
```bash
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

---

## Error Handling

### Information Disclosure Prevention

**Secure error responses**:
- No stack traces in production
- Generic error messages for users
- Detailed logging server-side only
- No internal system information exposed

**Example**:
```typescript
// ✅ Good
return NextResponse.json({ 
  error: 'Operation failed',
  message: 'Please try again'
}, { status: 500 });

// ❌ Bad
return NextResponse.json({ 
  error: error.message,
  stack: error.stack,
  details: internalDetails
}, { status: 500 });
```

---

## Monitoring

### Security Event Logging

Monitor for:
- Rate limit exceeded
- Invalid input attempts
- Failed authentication
- Suspicious patterns
- Repeated failures

### Threat Scoring

System tracks suspicious activities:
- Each suspicious action increments score
- High scores trigger blocking
- Scores decay over time
- Persistent offenders remain blocked

### Production Monitoring

**Setup webhook for alerts**:
```bash
MONITORING_WEBHOOK_URL=https://your-monitoring-service.com/webhook
```

**Review logs regularly**:
- Security events
- Rate limit hits
- Failed authentications
- Blocked requests

---

## Blockchain Security

### Transaction Verification

All payments verified on-chain:
- Check sender address
- Verify recipient address
- Confirm amount
- Validate currency/token
- Check transaction status

### Payment Security

**User payments**:
- User signs complete transaction
- Backend verifies before processing
- On-chain confirmation required
- No refunds (irreversible)

**Agent payments**:
- Verified via backend API
- On-chain validation
- Unique payment IDs prevent replay
- Timestamp validation for expiration

---

## Deployment Security

### Production Checklist

**Environment**:
- [ ] All API keys in environment variables
- [ ] No hardcoded credentials
- [ ] `.env` files in `.gitignore`
- [ ] Separate keys for dev/staging/prod

**Network**:
- [ ] HTTPS enabled
- [ ] CORS configured correctly
- [ ] Security headers set
- [ ] CSP policy reviewed

**Monitoring**:
- [ ] Error tracking configured
- [ ] Security logging enabled
- [ ] Alerts set up
- [ ] Rate limits appropriate

**Wallets**:
- [ ] Treasury wallet secured
- [ ] Agent wallets funded minimally
- [ ] Private keys backed up securely
- [ ] Access controls in place

**Services**:
- [ ] Database credentials rotated
- [ ] API keys rotated regularly
- [ ] Backup systems tested
- [ ] Incident response plan ready

---

## Development Security

### Local Development

**Secure practices**:
- Use `.env.local` for secrets (never commit)
- Use separate API keys for development
- Test security features before deployment
- Review code for security issues

**Testing**:
- Test rate limiting
- Verify input sanitization
- Check CORS configuration
- Test error handling
- Verify wallet signatures

---

## Incident Response

### If Compromise Suspected

**Immediate actions**:
1. Rotate all API keys
2. Review access logs
3. Check for unauthorized transactions
4. Update security measures
5. Document incident

**Treasury compromise**:
1. Transfer funds to new wallet
2. Update environment variables
3. Restart all services
4. Review transaction history
5. Investigate how compromise occurred

**API key leak**:
1. Rotate leaked keys immediately
2. Review recent API usage
3. Check for unexpected costs
4. Update configuration
5. Scan codebase for other leaks

---

## Best Practices Summary

### For Developers

- Never commit secrets to git
- Use environment variables for all keys
- Implement proper error handling
- Test security features
- Review code for vulnerabilities
- Keep dependencies updated

### For Operators

- Rotate keys regularly
- Monitor for suspicious activity
- Keep software updated
- Backup configuration securely
- Document security procedures
- Test incident response

### For Users

- Verify transaction details
- Keep wallet secure
- Monitor transaction history
- Report suspicious activity
- Don't share wallet credentials
- Use hardware wallets for large amounts

---

## Resources

### Security Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [CWE Top 25](https://cwe.mitre.org/top25/)

### Blockchain Security
- [Solana Security Best Practices](https://docs.solana.com/developers)
- [SPL Token Security](https://spl.solana.com/token)

### Web Security
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Content Security Policy](https://content-security-policy.com/)
- [CORS Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. **Do not** discuss publicly
3. Email security details privately
4. Include steps to reproduce
5. Allow time for fix before disclosure

**Responsible disclosure helps protect all users.**

---

**Last Updated**: November 2025

**Remember**: Security is an ongoing process, not a one-time setup. Regularly review and update security measures.
