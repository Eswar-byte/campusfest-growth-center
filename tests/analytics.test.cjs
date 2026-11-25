const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = file.match(/<script>([\s\S]*?)<\/script>/)[1];
let run;
beforeEach(() => {
  // Only the analytics are under test here. Use the same bundle the browser opens.
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, querySelector: element, addEventListener() {} },
    localStorage: { getItem() { return null; } }
  });
  vm.runInContext(script, context);
  run = code => vm.runInContext(code, context);
});

test('deduplicates source retries and preserves distinct stages and support types', () => {
  const a = run('histAgg(historical())');
  assert.deepEqual([a.touched,a.attempts,a.meetings,a.qualified,a.opportunities,a.proposals,a.wins,a.cashWins,a.cash,a.inKind,a.leaks],
    [180,370,60,60,58,46,24,20,2000000,240000,18]);
  assert.equal(run("historical().o.find(x=>x.opportunity_id==='O004').brand_name"), 'Mosaic Mobility');
});
test('past snapshots exclude later data and apply the active target', () => {
  assert.equal(run("historical('2025-01-15').o.length"), 0);
  assert.equal(run("historical('2025-03-14').targets.confirmed_partnerships_goal"),20);
  assert.equal(run("historical('2025-03-15').targets.confirmed_partnerships_goal"),28);
});
test('reconciles scenario cash and recomputes after recorded payments', () => {
  assert.equal(run('operating().vals.received'),522000);
  assert.equal(run('operating().vals.signed'),1040000);
  assert.equal(run('cases.stretch.signed*cases.stretch.collect'),5037000);
  run("state.receipts.push({id:'test',deal:'D04',amount:30000,date:'2026-02-11'})");
  assert.equal(run('operating().vals.received'),552000);
  run("state.cutoff='2026-02-10'");
  assert.equal(run('operating().vals.received'),522000);
});
test('pilot gates respond to campaign edits including zero qualifying leads', () => {
  assert.equal(run("signals().find(x=>x.id==='form').status"),'Stop');
  run('state.reads[1].form.qualified=5');
  assert.equal(run("signals().find(x=>x.id==='form').status"),'Scale');
  run('state.reads[1].form.qualified=0');
  assert.equal(run("signals().find(x=>x.id==='form').status"),'Stop');
});
test('history-to-follow-up preserves the same date and negotiating cohort', () => {
  assert.match(run("answer('What was negotiating in 2025?').result.text"),/7,20,000/);
  assert.match(run("answer('Break those down by owner').result.text"),/7,20,000/);
  assert.match(run("answer('How much bank cash was collected in 2025?').result.text"),/unknown/);
  assert.match(run("answer('Did Beardo increase festival attendance?').result.text"),/Creator Partners/);
});
test('suggestions are provisional and unfamiliar brand lookups use source IDs', () => {
  assert.equal(run("answer('Which campaign needs attention?').result.task.channel"),'form');
  assert.equal(run('state.tasks.length'),0);
  assert.match(run("answer('Tell me about Maple Devices').result.text"),/O007/);
  assert.match(run("answer('Which brand had the largest confirmed cash deal in 2025?').result.text"),/Beardo/);
});
test('query planner validates schema, filters stages and computes real grouped results', () => {
  const value=run("executePlan({table:'opportunities',op:'sum',field:'confirmed_value_inr',group:'sponsor_campaign_id',filters:[{field:'stage',test:'eq',value:'partner_confirmed'},{field:'support_type',test:'eq',value:'cash'}]},modelTables({scope:'history',date:'2025-04-20'}))");
  assert.match(value,/SC05: 7,25,000/);
  assert.throws(()=>run("executePlan({table:'campaigns',op:'sum',field:'made_up'},modelTables({scope:'live'}))"));
});
