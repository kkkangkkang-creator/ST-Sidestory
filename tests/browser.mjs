import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const dir=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({headless:true,executablePath:process.env.SIDE_STORY_BROWSER||undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://sideb.test/**', async r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="extensionsMenu"></div><script type="module" src="/scripts/extensions/third-party/ST-Sidestory/index.js"></script></body></html>'});
  if(p==='/scripts/world-info.js')return r.fulfill({contentType:'text/javascript',body:'export const world_names=["Book"];export const selected_world_info=["Book"];export async function loadWorldInfo(){return {entries:{0:{uid:0,comment:"Place",content:"A quiet cafe",disable:false}}}}'});
  if(p==='/scripts/extensions/shared.js')return r.fulfill({contentType:'text/javascript',body:'export {};'});
  if(p==='/script.js')return r.fulfill({contentType:'text/javascript',body:'export const user_avatar="user.png";export function isGenerating(){return false;}'});
  const rel=p.replace('/scripts/extensions/third-party/ST-Sidestory/','');
  if(!rel.startsWith('/')&&!rel.includes('..')&&fs.existsSync(path.join(dir,rel)))return r.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(path.join(dir,rel))});
  if(p==='/thumbnail')return r.fulfill({status:404,body:''});throw new Error('Unexpected request '+p);
 });
 await page.addInitScript(()=>{
  window.fixture={chatId:'Test chat',characterId:0,groupId:null,characters:[{avatar:'a.png',name:'A',data:{name:'A',description:'A quiet character',extensions:{world:'Book'}}}],chat:[{mes:'Let us meet at the cafe',name:'A',is_user:false}],chatMetadata:{},powerUserSettings:{personas:{'user.png':'User'},persona_descriptions:{'user.png':{description:'A friend'}}},name1:'User',mainApi:'openai',extensionSettings:{},saveSettingsDebounced(){},getTokenCountAsync:async text=>Math.ceil(text.length/3),getCurrentChatId(){return this.chatId;},generateRaw:async function(args){window.lastArgs=args;return window.nextResult||'두 사람은 카페에서 다시 만났다.';},eventSource:{on(){},removeListener(){}},eventTypes:{CHAT_CHANGED:'chat_changed'}};
  window.SillyTavern={getContext:()=>window.fixture};
 });
 await page.goto('https://sideb.test/');
 await page.locator('#side-story-wand').click();await page.locator('#open-references').click();
 await page.locator('#close-references-done').click();
 // Use story to verify end-to-end raw generation and archive without modifying chat.
 await page.locator('[data-mode="story"]').first().click();
 await page.locator('#request').fill('두 사람이 카페에서 만나는 외전');await page.locator('#generate').click();
 await page.waitForFunction(()=>window.lastArgs);
 await page.locator('#result').getByText('두 사람은 카페에서 다시 만났다.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>fixture.chat.length),1);
 assert((await page.evaluate(()=>JSON.stringify(lastArgs.prompt))).includes('A quiet character'));
 assert((await page.evaluate(()=>JSON.stringify(lastArgs.prompt))).includes('Let us meet'));
 await page.locator('[data-page="archive"]').first().click();await page.getByText('두 사람이 카페에서 만나는 외전',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(process.env.SIDE_STORY_TEST_OUTPUT||'/tmp','side-story-desktop-test.png')});
 await page.locator('[data-page="create"]').first().click();
 await page.locator('[data-mode="visual"]').first().click();
 await page.evaluate(()=>window.nextResult='<!doctype html><html><head><title>Cafe</title></head><body><h1>CAFE</h1><button id="demo">메뉴 보기</button><p id="menu" hidden>커피 4,000원</p><script>document.getElementById("demo").addEventListener("click",()=>document.getElementById("menu").hidden=false);<\/script></body></html>');
 await page.locator('#request').fill('카페 메뉴판');await page.locator('#generate').click();
 const frame=page.frameLocator('iframe');await frame.locator('#demo').click();assert(await frame.locator('#menu').isVisible());
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(process.env.SIDE_STORY_TEST_OUTPUT||'/tmp','side-story-mobile-test.png')});
 assert.deepEqual(errors,[]);
 await page.reload();await page.locator('#side-story-wand').click();await page.locator('[data-page="archive"]').first().click();await page.getByText('두 사람이 카페에서 만나는 외전',{exact:true}).first().waitFor();
 console.log('PASS browser: startup, linked references, raw generation, original chat unchanged, archive/reload, interactive HTML, mobile viewport.');
} finally {await browser.close();}
