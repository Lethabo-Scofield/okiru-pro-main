# Database-level append-only for the rules ledger

By default the rules collections use the application's database user, so "append-only" is enforced by the
application (Mongoose hooks). Anyone holding the application's credentials could still edit or delete history.
With `RULES_MONGO_URI` set, the rules ledger and Studio collections use a **separate restricted user** that has
**no update or delete privilege** on the append-only collections, so the database itself refuses.

## 1. Create the role and user (MongoDB Atlas: Database Access → Custom Roles, or `mongosh`)

Replace `okiru` with the application database name.

```js
db.getSiblingDB('admin').createRole({
  role: 'rulesStudioWriter',
  privileges: [
    // APPEND-ONLY: read and insert, never update or delete
    ...['rules_versions','rule_freezes','rule_audit_events','rule_approvals','rule_snapshots',
        'ruleset_pin_events','rule_change_request_events','rule_backup_checks','rule_notification_deliveries']
      .map((c) => ({ resource: { db: 'okiru', collection: c }, actions: ['find', 'insert'] })),
    // MUTABLE (drafts, grants, step-up challenges, notifications...): read, insert, update; still no delete
    ...['rule_changesets','impact_runs','step_up_challenges','studio_grants','rule_notifications',
        'rule_ai_proposals','ruling_answers','rule_change_requests']
      .map((c) => ({ resource: { db: 'okiru', collection: c }, actions: ['find', 'insert', 'update'] })),
  ],
  roles: [],
});
db.getSiblingDB('admin').createUser({ user: 'rules_studio', pwd: passwordPrompt(), roles: ['rulesStudioWriter'] });
```

(`clients` is NOT in the role. Client ruleset pins are written by the application's normal connection, not this one.)

## 2. Create the indexes (admin connection, once)

```bash
MONGO_ADMIN_URI="mongodb+srv://admin:...@cluster/okiru" node scripts/rules-studio-indexes.mjs
```

## 3. Point the API at it

```
RULES_MONGO_URI=mongodb+srv://rules_studio:...@cluster/okiru
```

Readiness (`GET /api/rules-studio/readiness`) shows the `restricted-db-user` check go green. With the restricted
user the app does not create indexes or collections itself (`autoIndex:false`, `autoCreate:false`), which is why step 2 exists.

## 4. Prove it (do this on staging before launch)

```js
// as rules_studio
db.rules_versions.updateOne({}, { $set: { publishedBy: 'x' } })   // must fail: not authorized
db.rules_versions.deleteMany({})                                   // must fail: not authorized
db.rules_versions.insertOne({ ... })                               // allowed
```

Record the result as a restore-drill entry (`POST /api/rules-studio/backups/drill-results`).

> Status: the role definition and scripts are provided but have **not been executed** against a real cluster
> (creating database users needs an administrator). Until you do, the readiness check stays red.
