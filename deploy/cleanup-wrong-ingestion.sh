#!/bin/bash
# =============================================================================
# Cleanup: Remove wrongly-ingested RCOGP Generic template
#
# The file "Lake Trading Toolkit (RCOGP)(1).xlsx" was ingested as an RCOGP
# Generic template. It is a CLIENT file, not a blank template. This script
# removes it and all associated data from ArangoDB.
#
# Run this script ON the server (20.164.207.196):
#   bash deploy/cleanup-wrong-ingestion.sh [--dry-run]
# =============================================================================

set -e

ARANGO_PASSWORD="${ARANGO_PASSWORD:-Okiru123!}"
ARANGO_DB="${ARANGO_DB:-bbbee_db}"
DRY_RUN=false

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "DRY RUN MODE — no changes will be made"
fi

# Run AQL queries inside the arangodb container
aql() {
  docker exec okiru_arango arangosh \
    --server.username root \
    --server.password "$ARANGO_PASSWORD" \
    --server.database "$ARANGO_DB" \
    --quiet \
    --javascript.execute-string "$1" 2>/dev/null
}

echo ""
echo "=== Finding wrongly-ingested formula graphs ==="

RESULT=$(docker exec okiru_arango arangosh \
  --server.username root \
  --server.password "$ARANGO_PASSWORD" \
  --server.database "$ARANGO_DB" \
  --quiet \
  --javascript.execute-string "
    var cursor = db._query('FOR g IN formula_graphs FILTER g.sourceFile IN [\"Lake Trading Toolkit (RCOGP)(1).xlsx\", \"Lake Trading  Toolkit (RCOGP).xlsx\"] RETURN { key: g._key, sourceFile: g.sourceFile, sectorCode: g.sectorCode, scorecardType: g.scorecardType, nodeCount: g.nodeCount }');
    var results = cursor.toArray();
    if (results.length === 0) { print(\"NONE\"); } else { results.forEach(function(r) { print(JSON.stringify(r)); }); }
  " 2>/dev/null)

echo "$RESULT"

if echo "$RESULT" | grep -q "NONE"; then
  echo ""
  echo "✅ No wrongly-ingested graphs found. Database is already clean."
  exit 0
fi

if $DRY_RUN; then
  echo ""
  echo "DRY RUN: Would delete the above graphs. Run without --dry-run to proceed."
  exit 0
fi

echo ""
echo "=== Cleaning up wrongly-ingested data ==="

# Delete everything linked to Lake Trading file
docker exec okiru_arango arangosh \
  --server.username root \
  --server.password "$ARANGO_PASSWORD" \
  --server.database "$ARANGO_DB" \
  --quiet \
  --javascript.execute-string "
    var clientFiles = ['Lake Trading Toolkit (RCOGP)(1).xlsx', 'Lake Trading  Toolkit (RCOGP).xlsx'];

    // Find the graph keys
    var graphs = db._query('FOR g IN formula_graphs FILTER g.sourceFile IN @files RETURN { key: g._key, sourceFile: g.sourceFile }', { files: clientFiles }).toArray();
    print('Found ' + graphs.length + ' graph(s) to remove');

    graphs.forEach(function(g) {
      print('Processing graph: ' + g.key + ' (' + g.sourceFile + ')');

      // Remove associated scorecards
      var scorecards = db._query('FOR sc IN scorecards FILTER sc.sourceFile == @sf RETURN sc._key', { sf: g.sourceFile }).toArray();
      scorecards.forEach(function(scKey) {
        var pillars = db._query('FOR p IN pillars FILTER p.scorecardId == @sk RETURN p._key', { sk: scKey }).toArray();
        pillars.forEach(function(pKey) {
          var indicators = db._query('FOR i IN indicators FILTER i.pillarId == @pk RETURN i._key', { pk: pKey }).toArray();
          indicators.forEach(function(iKey) {
            db._query('FOR t IN compliance_targets FILTER t.indicatorId == @ik REMOVE t IN compliance_targets', { ik: iKey });
            db.indicators.remove(iKey);
          });
          db._query('FOR e IN pillar_of FILTER e._from == @pf REMOVE e IN pillar_of', { pf: 'pillars/' + pKey });
          db._query('FOR e IN indicator_of FILTER e._to == @pt REMOVE e IN indicator_of', { pt: 'pillars/' + pKey });
          db.pillars.remove(pKey);
        });
        db.scorecards.remove(scKey);
        print('  Scorecard deleted: ' + scKey + ' (' + pillars.length + ' pillars)');
      });

      // Remove cell dependency edges
      var edgeCount = db._query('FOR e IN cell_dependency FILTER e.graphId == @gk REMOVE e IN cell_dependency RETURN 1', { gk: g.key }).toArray().length;
      print('  Cell edges deleted: ' + edgeCount);

      // Remove cells
      var cellCount = db._query('FOR c IN cells FILTER c.graphId == @gk REMOVE c IN cells RETURN 1', { gk: g.key }).toArray().length;
      print('  Cells deleted: ' + cellCount);

      // Remove the graph document
      db.formula_graphs.remove(g.key);
      print('  Graph deleted: ' + g.key);
    });

    print('');
    print('Remaining formula graphs:');
    var remaining = db._query('FOR g IN formula_graphs RETURN { key: g._key, sourceFile: g.sourceFile, sectorCode: g.sectorCode, scorecardType: g.scorecardType, nodeCount: g.nodeCount }').toArray();
    remaining.forEach(function(r) { print('  ' + r.key + ' | ' + r.sectorCode + ' ' + r.scorecardType + ' | ' + r.sourceFile + ' (' + r.nodeCount + ' nodes)'); });
  " 2>/dev/null

echo ""
echo "✅ Cleanup complete."
