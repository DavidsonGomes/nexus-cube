import {MODE_OPTIONS,UNCLASSIFIED_MODE_LABEL} from '../domain';
import type {StoredSolveMode} from '../domain';
export default function ModePicker({value,onChange,disabled=false,legacy=false}:{value:StoredSolveMode;onChange:(mode:StoredSolveMode)=>void;disabled?:boolean;legacy?:boolean}) {
  return <div className="mode-picker" role="group" aria-label="Modalidade 3×3">
    <span className="eyebrow">3×3 · MODALIDADE</span>
    <div className="segmented">{MODE_OPTIONS.map(option=><button key={option.value} type="button" disabled={disabled} aria-pressed={value===option.value} className={value===option.value?'selected':''} onClick={()=>onChange(option.value)}>{option.label}</button>)}
      {legacy&&<button type="button" disabled={disabled} aria-pressed={value===null} className={value===null?'selected':''} onClick={()=>onChange(null)}>{UNCLASSIFIED_MODE_LABEL}</button>}
    </div>
  </div>;
}
export function modeLabel(mode:StoredSolveMode):string {return MODE_OPTIONS.find(option=>option.value===mode)?.label??UNCLASSIFIED_MODE_LABEL;}
