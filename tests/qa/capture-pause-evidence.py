"""Run a focused pause check on the already-open case in Portal Sonda."""
from pathlib import Path
import json, shutil, subprocess, sys, time

repo = Path(__file__).resolve().parents[2]
label = sys.argv[1]
if not label.replace('-', '').isalnum(): raise SystemExit('Invalid evidence label')
target = repo / 'docs/qa/evidence' / label
target.mkdir(parents=True, exist_ok=False)
def portal(verb, *args):
    return subprocess.check_output(['maestri', 'portal', verb, 'Portal Sonda', *args], text=True)
def capture(name):
    p = Path(portal('screenshot').strip()); shutil.copy(p, target / (name+'.png'))

portal('select', '[aria-label="Velocidade da animação"]', '0.5×')
portal('click', '[aria-label="Reiniciar algoritmo"]')
capture('before')
portal('evaluate', (repo/'tests/qa/motion-observer.js').read_text())
actions=[]
actions.append({'action':'play', 'at':time.time(), 'result':portal('click','[aria-label="Reproduzir algoritmo"]')})
time.sleep(.35)
actions.append({'action':'pause', 'at':time.time(), 'result':portal('click','[aria-label="Pausar algoritmo"]')})
capture('paused')
time.sleep(1.7)
capture('after-pause-wait')
(target/'frames.json').write_text(portal('evaluate','JSON.stringify(window.__qaMotion)'))
(target/'actions.json').write_text(json.dumps(actions,indent=2)+'\n')
(target/'snapshot.txt').write_text(portal('snapshot'))
print(target)
