from pathlib import Path
import json,base64
root=Path(__file__).parent
src=root/'src'
files=['token-budget.js','extras.js','transport.js','core.js','renderer.js','extras-ui.js','enhancements.js','design.js','compact.js','extension.js']
code='const SIDE_STYLE='+json.dumps((src/'style.css').read_text(),ensure_ascii=False)+';\n'
code+='const SIDE_LAUNCHER_ICON='+json.dumps('data:image/png;base64,'+base64.b64encode((root/'assets/launcher-icon.png').read_bytes()).decode())+';\n'
code+='\n'.join((src/f).read_text() for f in files)
wrapper='''import { createSTHost } from './src/st-host.js';
let hostAdapter,starting;
function start(){if(!starting)starting=startOnce().finally(()=>{starting=null;});return starting;}
async function startOnce() {
 if(document.getElementById('st-sidestory-root'))return;
 if(!globalThis.SillyTavern?.getContext)throw new Error('실리태번 컨텍스트를 찾지 못했어요.');
 let world={},state={},services={};
 try { world=await import('../../../world-info.js'); } catch(e) { console.warn('[Side Story] World Info module unavailable',e); }
 try { state=await import('../../../../script.js'); } catch(e) { console.warn('[Side Story] Optional state module unavailable',e); }
 try { services=await import('../../shared.js'); } catch(e) { console.warn('[Side Story] Connection service module unavailable',e); }
 hostAdapter=createSTHost({world,state,services});
 await (async function(stHost){
'''
wrapper+=code+'\n})(hostAdapter);\n}\n'
wrapper+='''export function onDisable(){hostAdapter?.cleanup();}
export function onEnable(){return start();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(report),{once:true});
else start().catch(report);
function report(e){console.error('[Side Story]',e);globalThis.toastr?.error(e.message,'Side Story');}
'''
(root/'index.js').write_text(wrapper)
print('Built index.js')
