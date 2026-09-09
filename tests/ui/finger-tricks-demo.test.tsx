import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import FingerTricksDemo,{TrickDemo} from '../../src/components/trainers/FingerTricksDemo';
import {FINGER_TRICKS,VERIFIED_FINGER_TRICKS,selectFingerTrickCover} from '../../src/data/trainers/finger-tricks-registry';
import {integrateFingerTricks} from '../../src/data/trainers/finger-tricks';
import {pieceStickerIds} from '../../src/domain/stage-validation';

test('the list shows only what the registry provides, with domain restore cycles and no invented counts',()=>{
  const html=renderToStaticMarkup(<FingerTricksDemo/>);
  assert.match(html,new RegExp(`\\(${VERIFIED_FINGER_TRICKS.length}\\)`));
  const escape=(value:string)=>value.replace(/'/g,'&#x27;').replace(/[()]/g,'\\$&');
  for(const trick of VERIFIED_FINGER_TRICKS.slice(0,3))assert.match(html,new RegExp(escape(trick.record.name)));
  const sexy=VERIFIED_FINGER_TRICKS.find(trick=>trick.record.id==='tricks/sexy-right')!;
  assert.match(html,new RegExp(`${sexy.restoreCycles} ciclos restauram`));
});

test('grip demo renders touch guidance and anchors only under the domain showGrip authorization',()=>{
  const sexy=VERIFIED_FINGER_TRICKS.find(trick=>trick.record.id==='tricks/sexy-right')!;
  const html=renderToStaticMarkup(<TrickDemo trick={sexy} onBack={()=>{}}/>);
  assert.match(html,/Demonstração dos dedos/);
  const first=sexy.record.touches.find(touch=>touch.moveIndex===0)!;
  assert.match(html,new RegExp(first.action));
  const anchors=first.anchorPieces??[];
  if(anchors.length){for(const id of pieceStickerIds(anchors).slice(0,2))assert.match(html,new RegExp(id));}
  const proposed=integrateFingerTricks([{...structuredClone(sexy.record),id:'tricks/qa-proposed',mirrorOf:null,provenance:{status:'proposed'}}])[0];
  assert.equal(proposed.showGrip,false);
  const gated=renderToStaticMarkup(<TrickDemo trick={proposed} onBack={()=>{}}/>);
  assert.doesNotMatch(gated,/Demonstração dos dedos/);
  assert.match(gated,/ainda não tem pegada verificada/);
});

test('double-turn records expose both touches of the current move in order',()=>{
  const doubled=FINGER_TRICKS.find(trick=>trick.record.touches.some(touch=>touch.touchCount===2));
  assert.ok(doubled,'registry has a double-turn record');
  const index=doubled!.record.touches.find(touch=>touch.touchCount===2)!.moveIndex;
  const pair=doubled!.record.touches.filter(touch=>touch.moveIndex===index);
  assert.equal(pair.length,2);
  assert.deepEqual(pair.map(touch=>touch.touchIndex),[1,2]);
});

test('sequence recognizer panel is present and the cover picks longest tricks with isolated gaps',()=>{
  const html=renderToStaticMarkup(<FingerTricksDemo/>);
  assert.match(html,/Reconhecer numa sequência/);
  const cover=selectFingerTrickCover("R U R' U' R' F R F'");
  assert.equal(cover.length,2);
  assert.deepEqual(cover.map(o=>[o.trick.record.id,o.startStep,o.endStep]),[['tricks/sexy-right',0,4],['tricks/sledgehammer-right',4,8]]);
  const gapped=selectFingerTrickCover("F2 R U R' U' F2");
  assert.deepEqual(gapped.map(o=>[o.trick.record.id,o.startStep,o.endStep]),[['tricks/sexy-right',1,5]]);
});
