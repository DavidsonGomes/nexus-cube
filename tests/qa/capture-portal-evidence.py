"""Read-only evidence capture, only Portal Sonda. Writes docs/qa/evidence only."""
from pathlib import Path
import datetime, hashlib, json, re, shutil, subprocess, sys

repo = Path(__file__).resolve().parents[2]
label = sys.argv[1]
if not re.fullmatch(r'[a-z0-9-]+', label):
    raise SystemExit('Use a simple lowercase evidence label')
target = repo / 'docs/qa/evidence' / label
target.mkdir(parents=True, exist_ok=False)

def portal(verb, *args):
    return subprocess.check_output(['maestri', 'portal', verb, 'Portal Sonda', *args], text=True)

(target / 'snapshot.txt').write_text(portal('snapshot'))
observation = '''JSON.stringify({at:new Date().toISOString(),origin:location.origin,url:location.href,viewport:{width:innerWidth,height:innerHeight},body:document.body.innerText,data:localStorage.getItem("nexus-cube:v1"),sentinel:localStorage.getItem("nexus-cube:qa-isolation"),controller:navigator.serviceWorker?.controller?.scriptURL??null,resources:performance.getEntriesByType("resource").map(r=>({name:r.name,type:r.initiatorType,duration:r.duration}))})'''
(target / 'observation.json').write_text(portal('evaluate', observation))
capture = Path(portal('screenshot').strip())
shutil.copy(capture, target / 'screen.png')
hashes = {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for base in ['src', 'docs/domain-contract.md'] for p in ([repo / base] if (repo / base).is_file() else (repo / base).rglob('*')) if p.is_file()}
(target / 'source-hashes.json').write_text(json.dumps({'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'hashes': hashes}, indent=2)+'\n')
print(target)
