import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import TrainersPage from '../../src/features/Trainers';
import {TrainerDetailView,TrainerGroupView,TrainersOverview} from '../../src/components/trainers/TrainersCatalog';
import TrainerSessionLayout,{TimingModePicker,TrainerFlowSteps,TrainerSaveRetry,TrainerStopArea} from '../../src/components/trainers/TrainerSessionLayout';
import {TIMING_MODE_IDS,buildTrainerCatalog} from '../../src/components/trainers/catalog';
import type {TrainerFixtureSpec} from '../../src/data/trainers';
import {ROUX_TRAINER_FIXTURES} from '../../src/solver/methods/roux/trainer-fixtures';
import {ptBR} from '../../src/i18n/pt-BR';
import {LEARNING_CONTENT} from '../../src/domain';

const studyCounts=(methodId:string,stageId:string)=>LEARNING_CONTENT.filter(item=>item.methodId===methodId&&item.stageId===stageId).length;

test('overview presents the three group cards and only fixture-backed groups claim validated training',()=>{
  const bare=buildTrainerCatalog({studyCounts});
  for(const node of bare.flatMap(group=>group.nodes))assert.equal(node.coverage?.validatedContentCount??0,0);
  const html=renderToStaticMarkup(<TrainersPage onOpenLibrary={()=>assert.fail('library navigation during render')}/>);
  assert.match(html,/trainer-group-card/);
  for(const section of ['lbl','cfop','roux','technique'] as const)assert.match(html,new RegExp(ptBR.trainers.groups[section].title));
  assert.equal(bare[0].id,'lbl');assert.equal(bare[0].nodes.length,7);
  assert.match(html,/conteúdo em preparo/);
  assert.match(html,/com treino validado/);
  const live=buildTrainerCatalog({studyCounts,fixtures:ROUX_TRAINER_FIXTURES});
  for(const node of live.filter(group=>group.id!=='roux').flatMap(group=>group.nodes))assert.equal(node.coverage?.validatedContentCount??0,0);
  const rouxTotal=live.find(group=>group.id==='roux')!.nodes.reduce((sum,node)=>sum+(node.coverage?.validatedContentCount??0),0);
  assert.equal(rouxTotal,ROUX_TRAINER_FIXTURES.length);
  assert.match(html,/separado das suas resoluções completas/);
  assert.equal(bare.length,4);
});

test('group drill-down renders trainer cards with i18n text, coverage state and real study links only',()=>{
  const groups=buildTrainerCatalog({studyCounts});
  const cfop=groups.find(group=>group.id==='cfop')!;
  const html=renderToStaticMarkup(<TrainerGroupView group={cfop} onBack={()=>{}} onOpenTrainer={()=>{}} onOpenStudy={()=>{}}/>);
  assert.match(html,/Cruz \+ primeiro par/);assert.match(html,/Inserções traseiras/);
  assert.match(html,/Treino em preparo/);
  assert.match(html,/Estudar na Biblioteca \(\d+\)/);
  const roux=groups.find(group=>group.id==='roux')!;
  assert.equal(roux.nodes.length,4);
  const rouxHtml=renderToStaticMarkup(<TrainerGroupView group={roux} onBack={()=>{}} onOpenTrainer={()=>{}} onOpenStudy={()=>{}}/>);
  for(const name of ['Primeiro bloco \\(FB\\)','Segundo bloco \\(SB\\)','CMLL introdutório','LSE'])assert.match(rouxHtml,new RegExp(name));
  assert.doesNotMatch(rouxHtml,/42 casos|CMLL completo/);
  const lbl=groups.find(group=>group.id==='lbl')!;
  assert.equal(lbl.nodes.length,7);
  const lblHtml=renderToStaticMarkup(<TrainerGroupView group={lbl} onBack={()=>{}} onOpenTrainer={()=>{}} onOpenStudy={()=>{}}/>);
  for(const name of ['Cruz branca','Cantos da primeira camada','Meios da segunda camada','Cruz amarela','Alinhar as arestas amarelas','Posicionar os cantos amarelos','Virar os cantos amarelos'])assert.match(lblHtml,new RegExp(name));
  assert.doesNotMatch(lblHtml,/Estudar na Biblioteca|treino validado/);
  assert.match(lblHtml,/Treino em preparo/);
  for(const node of lbl.nodes){assert.equal(node.id,'lbl');assert.equal(node.coverage?.validatedContentCount,0);assert.equal(node.study,null);}
  const technique=groups.find(group=>group.id==='technique')!;
  const techniqueHtml=renderToStaticMarkup(<TrainerGroupView group={technique} onBack={()=>{}} onOpenTrainer={()=>{}} onOpenStudy={()=>{}}/>);
  assert.match(techniqueHtml,/Finger tricks/);assert.match(techniqueHtml,/Gatilhos/);
  assert.doesNotMatch(techniqueHtml,/Estudar na Biblioteca/);
  for(const node of technique.nodes)assert.equal(node.study,null);
  // Curated scope: one-handed stays absent; the personal tools are back as always-open tools.
  assert.equal(technique.nodes.length,6);
  assert.doesNotMatch(techniqueHtml,/Uma mão/);
  assert.match(techniqueHtml,/Laboratório de algoritmos/);assert.match(techniqueHtml,/Editor visual de casos/);
  assert.match(techniqueHtml,/Ferramenta pessoal/);
  for(const group of groups)assert.ok(group.nodes.length>0,'nenhuma seção vazia renderiza');
  const keys=groups.flatMap(g=>g.nodes.map(n=>n.key));
  assert.ok(!keys.includes('one-handed' as never));
});

test('trainer detail explains honest state and the six timing modes with preparation outside the clock',()=>{
  const groups=buildTrainerCatalog({studyCounts});
  const roux=groups.find(group=>group.id==='roux')!.nodes.find(node=>node.key==='roux-fb')!;
  const html=renderToStaticMarkup(<TrainerDetailView section="roux" node={roux} onBack={()=>{}} onOpenStudy={()=>{}}/>);
  assert.match(html,/Primeiro bloco \(FB\)/);assert.match(html,/FB completo/);
  assert.match(html,/Este treinador ativa quando o conteúdo validado chegar/);
  for(const mode of TIMING_MODE_IDS)assert.match(html,new RegExp(ptBR.trainers.timing[mode].label));
  assert.match(html,/preparo fica sempre fora do tempo, e a inspeção é registrada separada/);
});

test('coverage derives only from approved fixtures through the Prisma contract',()=>{
  const fixture=(id:string):TrainerFixtureSpec=>({id,trainerId:'f2l',methodId:'cfop',stageId:'f2l',groupId:'basic',kind:'execution',name:'Par sintético',objective:'Inserir o par sem quebrar a cruz.',precondition:{predicate:'cross'},goal:{predicate:'f2l-pair',targetSlot:'FR'},preserve:['DF'],referenceFrame:'fixed',setupSubgroup:null,difficulty:null,focus:null,provenance:[]});
  const groups=buildTrainerCatalog({studyCounts,fixtures:[fixture('cfop/f2l/a'),fixture('cfop/f2l/b'),fixture('cfop/f2l/c')]});
  const cfop=groups.find(group=>group.id==='cfop')!;
  const f2l=cfop.nodes.find(node=>node.key==='f2l')!;
  assert.equal(f2l.coverage.validatedContentCount,3);assert.equal(f2l.coverage.declared,'partial');
  for(const node of groups.flatMap(group=>group.nodes).filter(node=>node.key!=='f2l')){assert.equal(node.coverage?.validatedContentCount??0,0);if(node.coverage)assert.equal(node.coverage.declared,'introductory');}
  const rouxFixture:TrainerFixtureSpec={id:'roux/fb/a',trainerId:'roux',methodId:'roux',stageId:'fb',groupId:'fb',kind:'execution',name:'Bloco sintético',objective:'Completar o bloco esquerdo.',precondition:null,goal:{predicate:'fb'},preserve:[],referenceFrame:'centers',setupSubgroup:null,difficulty:null,focus:null,provenance:[]};
  const rouxGroups=buildTrainerCatalog({studyCounts,fixtures:[rouxFixture]});
  const rouxNodes=rouxGroups.find(group=>group.id==='roux')!.nodes;
  assert.equal(rouxNodes.find(node=>node.key==='roux-fb')!.coverage!.validatedContentCount,1);
  assert.equal(rouxNodes.find(node=>node.key==='roux-sb')!.coverage!.validatedContentCount,0);
  const overview=renderToStaticMarkup(<TrainersOverview groups={groups} onOpenGroup={()=>{}}/>);
  assert.match(overview,/1 com treino validado/);
  const groupHtml=renderToStaticMarkup(<TrainerGroupView group={cfop} onBack={()=>{}} onOpenTrainer={()=>{}} onOpenStudy={()=>{}}/>);
  assert.match(groupHtml,/3 treinos validados · cobertura parcial/);
  assert.doesNotMatch(groupHtml,/cobertura completa/);
});

test('session shell keeps the six timing modes, preparation outside the clock and save retry without reset',()=>{
  const picker=renderToStaticMarkup(<TimingModePicker value="timed" onChange={()=>{}}/>);
  for(const mode of TIMING_MODE_IDS)assert.match(picker,new RegExp(`>${ptBR.trainers.timing[mode].label}<`));
  assert.match(picker,/aria-pressed="true"[^>]*>Cronometrado</);
  assert.match(picker,/O preparo fica sempre fora do tempo\./);
  const limited=renderToStaticMarkup(<TimingModePicker value="recognition" onChange={()=>{}} available={['recognition','free']}/>);
  assert.doesNotMatch(limited,/>Cronometrado</);assert.match(limited,/>Reconhecimento</);
  const shell=renderToStaticMarkup(<TrainerSessionLayout header={<TrainerFlowSteps current="attempt"/>} cube={<span>cube-slot</span>} context={<span>context-slot</span>} clock={<TrainerStopArea label="Parar" onStop={()=>{}}/>} history={<span>history-slot</span>}/>);
  assert.match(shell,/aria-current="step"[^>]*>Tentar</);
  assert.match(shell,/trainer-stop/);assert.match(shell,/desta área/);assert.match(shell,/cube-slot/);assert.match(shell,/context-slot/);assert.match(shell,/history-slot/);
  const retry=renderToStaticMarkup(<TrainerSaveRetry message="Não foi possível salvar a tentativa." onRetry={()=>{}}/>);
  assert.match(retry,/tempo e o contexto desta tentativa foram preservados/);
  assert.match(retry,/Salvar novamente/);
});

test('R1 shell registers the Treinadores navigation entry',()=>{
  const source=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(source,/id:'trainers',icon:Dumbbell/);
  assert.match(source,/t\.shell\.nav\[id\]/);
  assert.match(source,/area==='trainers'\?<TrainersPage/);
});
