const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],API='api.php?a=';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me=null,cur=null,last=0,mode='login',timer=null,busy=false,snap='',rec=null,chunks=[],rt,rs,pfile=null,voicePreview=null,voicePreviewUrl=null,voiceDuration=0,previewPlayer=null;

/* ---------- helpers ---------- */
async function api(a,d,form){
  const o={method:'POST',credentials:'same-origin'};
  if(form)o.body=form;else{o.headers={'Content-Type':'application/json'};o.body=JSON.stringify(d||{});}
  const r=await fetch(API+a,o),j=await r.json().catch(()=>({error:r.status===413?'Upload exceeds the server request-size limit. Try a smaller file.':'Server error'}));
  if(!r.ok){const e=new Error(j.error||'Something went wrong');e.code=r.status;throw e;}
  return j;
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2600);}
function show(id){$$('.screen').forEach(s=>s.classList.toggle('active',s.id===id));}
async function run(btn,fn){btn.classList.add('load');btn.disabled=true;try{await fn()}catch(e){toast(e.message)}btn.classList.remove('load');btn.disabled=false;}
const av=(u,n)=>`<div class="av ${u.id%2?'b':''}">${esc(u.username[0].toUpperCase())}</div>`;
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');

/* ripple on every button */
document.addEventListener('click',e=>{
  const b=e.target.closest('.btn,.ic,.act,.once,.play');if(!b)return;
  const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height),p=document.createElement('span');
  p.className='rip';p.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;
  b.style.position=b.style.position||'relative';b.appendChild(p);setTimeout(()=>p.remove(),600);
});

/* ---------- theme ---------- */
function setTheme(t){document.documentElement.dataset.theme=t;localStorage.setItem('ping_theme',t);}
setTheme(localStorage.getItem('ping_theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');

/* ---------- auth ---------- */
function setMode(m){
  mode=m;$('#m-login').classList.toggle('on',m==='login');$('#m-signup').classList.toggle('on',m==='signup');
  $('.seg').classList.toggle('right',m==='signup');$('#u').hidden=m==='login';
  $('#e').placeholder=m==='login'?'Email or username':'Email address';$('#e').type=m==='login'?'text':'email';
  $('#go span').textContent=m==='login'?'Sign in':'Create account';$('#p').autocomplete=m==='login'?'current-password':'new-password';
  $('#password-help').hidden=m==='login';$('#p').minLength=m==='login'?0:8;
  $('#p').value='';$('#p').type='password';$('#toggle-password').innerHTML=eyeIcon(false);
  $('#toggle-password').setAttribute('aria-label','Show password');$('#toggle-password').setAttribute('aria-pressed','false');
}
const eyeIcon=hidden=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>${hidden?'':'<path d="m3 3 18 18"></path>'}</svg>`;
$('#m-login').onclick=()=>setMode('login');$('#m-signup').onclick=()=>setMode('signup');
$('#af').onsubmit=e=>{e.preventDefault();run($('#go'),async()=>{
  if(mode==='signup'&&!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test($('#p').value)){
    throw new Error('Use at least 8 characters, including a letter, a number, and a special character');
  }
  await api(mode,{id:$('#e').value,username:$('#u').value,email:$('#e').value,password:$('#p').value});
  $('#p').value='';await boot();
});};
$('#toggle-password').onclick=()=>{
  const reveal=$('#p').type==='password';$('#p').type=reveal?'text':'password';
  $('#toggle-password').innerHTML=eyeIcon(reveal);
  $('#toggle-password').setAttribute('aria-label',reveal?'Hide password':'Show password');
  $('#toggle-password').setAttribute('aria-pressed',String(reveal));
};
$('#logout').onclick=()=>run($('#logout'),async()=>{
  await api('logout');clearInterval(timer);cur=null;snap='';last=0;show('auth');
});

async function initGoogle(){
  try{
    const c=await (await fetch(API+'cfg')).json();if(!c.google)return;
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=()=>{
      google.accounts.id.initialize({client_id:c.google,callback:r=>api('google',{credential:r.credential}).then(boot).catch(e=>toast(e.message))});
      google.accounts.id.renderButton($('#g'),{theme:'outline',size:'large',shape:'pill',text:'continue_with'});
    };document.head.appendChild(s);
  }catch(e){}
}

/* ---------- home ---------- */
$$('.nav button').forEach(b=>b.onclick=()=>{
  $$('.nav button').forEach(x=>x.classList.toggle('on',x===b));
  $$('.tab').forEach(t=>t.classList.toggle('on',t.id==='t-'+b.dataset.t));
});
$('#fgo').onclick=()=>run($('#fgo'),async()=>{
  const r=await api('request',{username:$('#fu').value});$('#fu').value='';toast(r.msg);sync();
});
function renderHome(s){
  const k=JSON.stringify([s.friends,s.requests,s.blocked]);if(k===snap)return;snap=k;
  $('#t-chats').innerHTML=s.friends.length?s.friends.map((f,i)=>`<div class="item" data-f="${f.id}" style="animation-delay:${i*50}ms">${av(f)}<span class="nm">@${esc(f.username)}</span>${+f.unread?`<b class="badge" style="position:static">${f.unread}</b>`:''}</div>`).join(''):'<div class="empty">No chats yet.<br>Add a friend by username to start pinging.</div>';
  $('#t-req').innerHTML=s.requests.length?s.requests.map(r=>`<div class="item">${av({id:0,username:r.username})}<span class="nm">@${esc(r.username)}</span><button class="btn sm" data-r="${r.id}" data-y="1"><span>Accept</span></button><button class="btn sm ghost" data-r="${r.id}"><span>Decline</span></button></div>`).join(''):'<div class="empty">No pending requests.</div>';
  $('#blocked-list').innerHTML=s.blocked.length?s.blocked.map(u=>`<div class="item blocked-item"><span class="nm">@${esc(u.username)}</span><button class="btn sm ghost" data-unblock="${u.id}"><span>Unblock</span></button></div>`).join(''):'<p class="mute">You haven’t blocked anyone.</p>';
  const u=s.friends.reduce((a,f)=>a+ +f.unread,0);
  [['#b-chats',u],['#b-req',s.requests.length]].forEach(([id,n])=>{const e=$(id);e.hidden=!n;e.textContent=n;});
  s.friends.forEach(f=>{if(cur&&cur.id==f.id)cur=f;});
}
$('#t-chats').onclick=e=>{const i=e.target.closest('[data-f]');if(!i)return;const f=snap&&JSON.parse(snap)[0].find(x=>x.id==i.dataset.f);openChat(f);};
$('#t-req').onclick=e=>{const b=e.target.closest('[data-r]');if(!b)return;
  run(b,async()=>{await api('respond',{id:b.dataset.r,accept:b.dataset.y?1:0});toast(b.dataset.y?'Friend added':'Request declined');snap='';sync();});};
$('#blocked-list').onclick=e=>{const b=e.target.closest('[data-unblock]');if(!b)return;
  run(b,async()=>{await api('unblock',{id:b.dataset.unblock});toast('User unblocked');snap='';sync();});};

async function sync(){const s=await api('sync');me=s.me;renderHome(s);return s;}

/* ---------- chat ---------- */
function openChat(f){
  cur=f;last=0;$('#msgs').innerHTML='';$('#cname').textContent='@'+f.username;$('#cav').className='av '+(f.id%2?'b':'');$('#cav').textContent=f.username[0].toUpperCase();
  show('chat');poll();
}
$('#back').onclick=()=>{cancelVoice();cur=null;snap='';show('home');sync();};
const au={};
function bubble(m){
  const d=document.createElement('div');d.className='b '+(+m.mine?'me':'them');d.id='m'+m.id;
  const t=new Date(m.ts*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});let h='';
  if(m.type==='text')h=esc(m.body);
  else if(m.type==='voice'&&+m.once)h=+m.mine?`<span class="ot" data-once-type="voice">${+m.viewed?'Heard ✓':'🎤 Voice · hear once'}</span>`:(+m.viewed?'<span>Heard</span>':`<button class="once" data-vo="${m.id}">🎤 Tap to hear once</button>`);
  else if(m.type==='voice')h=`<button class="play" data-v="${m.id}">▶</button><span class="wave"><i></i><i></i><i></i><i></i><i></i></span>`;
  else if(+m.once)h=+m.mine?`<span class="ot">${+m.viewed?'Opened ✓':'📸 Photo · view once'}</span>`:(+m.viewed?'<span>Opened</span>':`<button class="once" data-o="${m.id}">📸 Tap to view once</button>`);
  else h=`<img loading="lazy" src="${API}media&id=${m.id}" alt="photo">`;
  d.innerHTML=h+`<small>${t}</small>`;return d;
}
async function poll(){
  if(busy)return;busy=true;
  try{
    const s=await sync();
    if(cur){
      const r=await api(`msgs&with=${cur.id}&after=${last}`),box=$('#msgs'),near=box.scrollHeight-box.scrollTop-box.clientHeight<120||!last;
      r.msgs.forEach(m=>{if(!$('#m'+m.id)){box.appendChild(bubble(m));last=Math.max(last,+m.id);}});
      r.opened.forEach(id=>{const o=$('#m'+id+' .ot');if(o)o.textContent=o.dataset.onceType==='voice'?'Heard ✓':'Opened ✓';});
      if(r.msgs.length&&near)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});
    }
  }catch(e){if(e.code===401){clearInterval(timer);show('auth');}}
  busy=false;
}
$('#msgs').onclick=async e=>{
  const p=e.target.closest('.play'),o=e.target.closest('.once');
  if(p){
    const id=p.dataset.v,w=p.nextElementSibling;
    try{
      if(!au[id]){const r=await fetch(API+'media&id='+id,{credentials:'same-origin'});if(!r.ok)throw new Error('Could not load voice message');au[id]=new Audio(URL.createObjectURL(await r.blob()));au[id].onended=()=>{p.textContent='▶';w.classList.remove('on');};}
      const a=au[id];if(a.paused){await a.play();p.textContent='❚❚';w.classList.add('on');}else{a.pause();p.textContent='▶';w.classList.remove('on');}
    }catch(x){toast(x.message);}
  }
  if(o){
    o.disabled=true;
    try{
      const isVoice=!!o.dataset.vo,id=isVoice?o.dataset.vo:o.dataset.o;
      const r=await fetch(API+'media&id='+id,{credentials:'same-origin'});if(!r.ok)throw new Error('This one-time media was already opened');
      const src=URL.createObjectURL(await r.blob());
      $('#vimg').hidden=isVoice;$('#vaudio').hidden=!isVoice;
      if(isVoice){$('#vaudio').src=src;$('#vaudio').play().catch(()=>toast('Tap play to hear the voice message'));}
      else $('#vimg').src=src;
      $('#viewer-caption').textContent=isVoice?'One-time voice · it’s gone when you close this':'One-time photo · it’s gone when you close this';
      $('#viewer').classList.add('open');
      o.replaceWith(Object.assign(document.createElement('span'),{textContent:isVoice?'Heard':'Opened'}));
    }catch(x){toast(x.message);o.replaceWith(Object.assign(document.createElement('span'),{textContent:o.dataset.vo?'Heard':'Opened'}));}
  }
};
$('#vclose').onclick=()=>{
  $('#viewer').classList.remove('open');const a=$('#vaudio'),i=$('#vimg');
  if(a.src){a.pause();URL.revokeObjectURL(a.src);a.removeAttribute('src');a.load();}
  if(i.src){URL.revokeObjectURL(i.src);setTimeout(()=>i.removeAttribute('src'),300);}
  a.hidden=true;i.hidden=false;
};
$('#viewer').oncontextmenu=e=>e.preventDefault();
$('#block-user').onclick=()=>run($('#block-user'),async()=>{
  if(!cur||!confirm(`Block @${cur.username}? They will be removed from your chats and cannot message or send you a request.`))return;
  await api('block',{id:cur.id});cancelVoice();cur=null;last=0;snap='';$('#msgs').innerHTML='';show('home');toast('User blocked');await sync();
});

/* composer: mic <-> send morph */
function setAct(){const a=$('#act'),has=$('#txt').value.trim();a.classList.toggle('mic',!has);a.disabled=!!rec||!!voicePreview;}
$('#txt').oninput=setAct;
$('#txt').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#act').click();}};
$('#act').onclick=async()=>{
  if(rec||voicePreview)return;
  const v=$('#txt').value.trim();
  if(v){$('#txt').value='';setAct();try{await api('send',{with:cur.id,body:v});poll();}catch(e){toast(e.message);$('#txt').value=v;setAct();}}
  else startRec();
};
async function startRec(){
  let st;
  try{
    st=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!window.MediaRecorder)throw new Error('Voice recording is not supported in this browser');
    const mt=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
    rec=mt?new MediaRecorder(st,{mimeType:mt}):new MediaRecorder(st);
    rec._st=st;rec._mt=mt||rec.mimeType||'audio/webm';chunks=[];
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    rec.onstop=()=>finishRecording();
    rec.start();rs=Date.now();$('#clock').textContent='0:00';
    $('#rec-status').textContent='Recording…';$('#rec-dot').hidden=false;
    $('#rstop').hidden=false;$('#rplay').hidden=true;$('#rsend').hidden=true;
    $('#composer').classList.add('rec','recording');setAct();
    rt=setInterval(()=>$('#clock').textContent=fmt((Date.now()-rs)/1000),250);
  }catch(e){
    if(st)st.getTracks().forEach(t=>t.stop());
    rec=null;$('#composer').classList.remove('rec','recording');setAct();
    toast(e.message==='Voice recording is not supported in this browser'?e.message:'Allow microphone access (needs HTTPS)');
  }
}
function finishRecording(){
  if(!rec)return;
  const r=rec;voiceDuration=Math.max(1,Math.round((Date.now()-rs)/1000));
  r._st.getTracks().forEach(t=>t.stop());
  voicePreview=new Blob(chunks,{type:r._mt});chunks=[];rec=null;
  if(!voicePreview.size){toast('No audio was recorded');discardVoicePreview();return;}
  voicePreviewUrl=URL.createObjectURL(voicePreview);
  $('#rec-status').textContent='Preview before sending';$('#rec-dot').hidden=true;
  $('#rstop').hidden=true;$('#rplay').hidden=false;$('#rsend').hidden=false;
  $('#composer').classList.remove('recording');$('#clock').textContent=fmt(voiceDuration);setAct();
}
function stopRec(){
  if(!rec)return;
  clearInterval(rt);rt=null;$('#rec-status').textContent='Preparing…';
  if(rec.state!=='inactive')rec.stop();
}
function discardVoicePreview(){
  if(previewPlayer){previewPlayer.pause();previewPlayer.removeAttribute('src');previewPlayer.load();previewPlayer=null;}
  if(voicePreviewUrl)URL.revokeObjectURL(voicePreviewUrl);
  voicePreview=null;voicePreviewUrl=null;chunks=[];voiceDuration=0;
  $('#voice-once').checked=false;$('#clock').textContent='0:00';
  $('#rplay').textContent='▶ Preview';
  $('#composer').classList.remove('rec','recording');$('#rplay').hidden=true;
  $('#rsend').hidden=true;$('#rstop').hidden=false;setAct();
}
$('#rstop').onclick=stopRec;
function cancelVoice(){
  if(rec){const r=rec;rec=null;r.onstop=null;clearInterval(rt);rt=null;r._st.getTracks().forEach(t=>t.stop());if(r.state!=='inactive')r.stop();}
  discardVoicePreview();
}
$('#rcancel').onclick=cancelVoice;
$('#rplay').onclick=async()=>{
  if(!voicePreviewUrl)return;
  if(!previewPlayer){previewPlayer=new Audio(voicePreviewUrl);previewPlayer.onended=()=>{$('#rplay').textContent='▶ Preview';};}
  if(previewPlayer.paused){
    try{await previewPlayer.play();$('#rplay').textContent='❚❚ Pause';}catch(e){toast('Could not play voice preview');}
  }else{previewPlayer.pause();$('#rplay').textContent='▶ Preview';}
};
$('#rsend').onclick=()=>run($('#rsend'),async()=>{
  if(!voicePreview||!cur)throw new Error('Record a voice message first');
  const mime=voicePreview.type||'audio/webm';
  const ext=mime.includes('webm')?'webm':mime.includes('ogg')?'ogg':mime.includes('mpeg')?'mp3':'m4a';
  const f=new FormData();f.append('with',cur.id);f.append('kind','voice');
  f.append('once',$('#voice-once').checked?'1':'0');
  f.append('file',voicePreview,`voice.${ext}`);
  await api('upload',null,f);discardVoicePreview();poll();
});

const emojis='😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😍 🥰 😘 😎 🤔 😭 😡 👍 👎 👏 🙌 🙏 ❤️ 💕 💯 🔥 🎉 ✅ 👋 🤝'.split(' ');
const picker=$('#emoji-picker');
picker.innerHTML=emojis.map(emoji=>`<button type="button" class="emoji-option" aria-label="${emoji}">${emoji}</button>`).join('');
$('#emoji-toggle').onclick=()=>{
  picker.hidden=!picker.hidden;$('#emoji-toggle').setAttribute('aria-expanded',String(!picker.hidden));
};
picker.onclick=e=>{
  const b=e.target.closest('.emoji-option');if(!b)return;
  const input=$('#txt'),start=input.selectionStart,end=input.selectionEnd;
  input.setRangeText(b.textContent,start,end,'end');input.focus();setAct();
};
document.addEventListener('click',e=>{
  if(!e.target.closest('#emoji-picker')&&!e.target.closest('#emoji-toggle')){
    picker.hidden=true;$('#emoji-toggle').setAttribute('aria-expanded','false');
  }
});

/* photo with view-once */
$('#file').onchange=e=>{
  pfile=e.target.files[0];e.target.value='';if(!pfile)return;
  if(pfile.type&&!pfile.type.startsWith('image/')){pfile=null;toast('Choose an image file');return;}
  if(pfile.size>8*1024*1024){pfile=null;toast('Image must be 8 MB or smaller');return;}
  if(!cur){pfile=null;toast('Open a chat before sending an image');return;}
  $('#pimg').src=URL.createObjectURL(pfile);$('#once').checked=true;$('#sheet').classList.add('open');
};
$('#pno').onclick=()=>{closePhotoSheet();};
function closePhotoSheet(){
  $('#sheet').classList.remove('open');
  if($('#pimg').src)URL.revokeObjectURL($('#pimg').src);
  $('#pimg').removeAttribute('src');pfile=null;
}
$('#pyes').onclick=()=>run($('#pyes'),async()=>{
  if(!pfile||!cur)throw new Error('Choose an image in an open chat');
  const f=new FormData();f.append('with',cur.id);f.append('kind','image');f.append('once',$('#once').checked?1:0);f.append('file',pfile);
  await api('upload',null,f);closePhotoSheet();toast('Photo sent');poll();
});

/* ---------- boot ---------- */
async function boot(){
  try{await sync();show('home');clearInterval(timer);timer=setInterval(poll,2500);}
  catch(e){show('auth');}
}
initGoogle();boot();
