# Website Scripts

## Bug Report Generation

### generate-bug-report.ts
**Purpose:** Automated bug report generator that runs all tests and creates a structured markdown report.

**Usage:**
```bash
npm run test:report
```

**What it does:**
1. Runs all integration tests (Jest)
2. Runs all E2E tests (Playwright)
3. Captures all test failures
4. Categorizes bugs by system (Frontend/Backend/Agents/Payments/Database)
5. Assigns severity levels (Critical/High/Medium/Low)
6. Generates action items for each bug
7. Creates `BUG_REPORT.md` with structured findings

**Output:** `BUG_REPORT.md`

**Example output:**
```markdown
# Bug Report
Total Bugs Found: 5

## 🔴 Critical Priority Issues
### 1. Timeout: Agent trump-donald not responding
**System:** Agents
**Action Items:**
- [ ] Review agent main.py
- [ ] Check Coral Server connection
```

### test-reporter.js
**Purpose:** Custom Jest reporter that provides a summary of test failures.

**Usage:** Automatically used by Jest during test runs.

**What it does:**
- Captures test failures as they occur
- Prints a formatted summary at the end of test runs
- Feeds data to the bug report generator

---

## Configuration Management

### fetch-configs.js
**Purpose:** Fetches agent configurations from AWS S3 before build.

**Usage:** Automatically runs during `npm run prebuild`

**What it does:**
- Downloads agent personality files from S3
- Downloads operational instructions
- Ensures configs are available for build process

---

## Admin Tools

### create-admin.ts
**Purpose:** Creates admin users in the database.

**Usage:**
```bash
npm run admin:create
```

**What it does:**
- Prompts for wallet address
- Creates admin user in database
- Grants admin privileges

---

## Database Scripts

Located in `website/` root (not in scripts/ directory):

### reset-database.js
**Purpose:** Resets the entire database to clean state.

**Usage:**
```bash
npm run db:reset
```

**Warning:** Deletes all data!

### check-user-scores.js
**Purpose:** Displays user scores from database.

**Usage:**
```bash
npm run db:check-scores
```

### merge-duplicate-sessions.js
**Purpose:** Merges duplicate sessions for the same user.

**Usage:**
```bash
npm run db:merge-sessions
```

---

## Adding New Scripts

When adding a new script:

1. **TypeScript scripts** - Add to `scripts/` directory with `.ts` extension
   ```typescript
   #!/usr/bin/env ts-node
   // Your script here
   ```

2. **JavaScript scripts** - Add to `scripts/` directory with `.js` extension
   ```javascript
   #!/usr/bin/env node
   // Your script here
   ```

3. **Add npm script** in `package.json`:
   ```json
   "scripts": {
     "your-script": "ts-node --project tsconfig.node.json scripts/your-script.ts"
   }
   ```

4. **Document it** in this README

5. **Make it executable** (optional):
   ```bash
   chmod +x scripts/your-script.ts
   ```

---

## Script Dependencies

All scripts use:
- `ts-node` for TypeScript execution
- `tsconfig.node.json` for TypeScript configuration
- Node.js 18+

If a script fails with TypeScript errors:
```bash
npm install
```

---

## Testing Scripts

To test a script without running through npm:
```bash
cd website
ts-node --project tsconfig.node.json scripts/your-script.ts
```

---

## Script Patterns

### Reading files
```typescript
import fs from 'fs';
import path from 'path';

const filePath = path.join(__dirname, '../some-file.txt');
const content = fs.readFileSync(filePath, 'utf-8');
```

### Executing commands
```typescript
import { execSync } from 'child_process';

try {
  execSync('npm run test', { stdio: 'inherit' });
} catch (error) {
  console.error('Command failed');
}
```

### JSON parsing
```typescript
const data = JSON.parse(fs.readFileSync('file.json', 'utf-8'));
```

### Error handling
```typescript
try {
  // risky operation
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
```

