import test from 'node:test';
import assert from 'node:assert/strict';
import { trackChildWorkers } from '../../../src/solver/worker-lifecycle';

test('scoped child registry terminates every child once and blocks late fallback creation after close',()=>{
  const workers:{terminations:number}[]=[];
  class Native {terminations=0;constructor(){workers.push(this);}terminate(){this.terminations++;}}
  const host={Worker:Native as unknown as typeof Worker},original=host.Worker;
  const registry=trackChildWorkers(host);
  const first=new host.Worker('local-child'),second=new host.Worker('local-fallback');
  assert.equal(registry.count,2);first.terminate();assert.equal(registry.count,1);
  registry.close();registry.close();assert.equal(registry.count,0);
  assert.deepEqual(workers.map(w=>w.terminations),[1,1]);
  assert.throws(()=>new host.Worker('late'));assert.equal(workers.length,2);
  assert.equal(original,Native);assert.ok(second instanceof Native);
});
