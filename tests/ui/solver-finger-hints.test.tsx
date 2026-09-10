import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import FingerTrickHints from '../../src/components/FingerTrickHints';
import SolverPlayer from '../../src/components/SolverPlayer';
import {solvedCube,applyAlgorithm,invertAlgorithm} from '../../src/domain/cube';

test('hints follow the exact sequence: trick card on covered steps, honest gap note elsewhere',()=>{
  const tokens=['F2',"R","U","R'","U'",'F2'];
  const covered=renderToStaticMarkup(<FingerTrickHints tokens={tokens} step={1}/>);
  assert.match(covered,/Sexy move \(direito\)/);
  assert.match(covered,/movimentos 2 a 5/);
  assert.match(covered,/Mão direita · pulso/);
  const gap=renderToStaticMarkup(<FingerTrickHints tokens={tokens} step={0}/>);
  assert.match(gap,/Nenhum gatilho verificado cobre este movimento/);
  const uncovered=renderToStaticMarkup(<FingerTrickHints tokens={['F2','B2']} step={0}/>);
  assert.equal(uncovered,'');
});

test('solver player exposes the opt-in toggle and no grip content before opting in',()=>{
  const algorithm="R U R' U'";
  const initial=applyAlgorithm(solvedCube(),invertAlgorithm(algorithm));
  const html=renderToStaticMarkup(<SolverPlayer initialState={initial} algorithm={algorithm}/>);
  assert.match(html,/Mostrar finger tricks/);
  assert.doesNotMatch(html,/finger-hints/);
});
