const $=id=>document.getElementById(id), audio=$('audio'),dialog=$('dialog');
const paths={play:'M6 3l15 9-15 9z',pause:'M6 4h4v16H6zm8 0h4v16h-4z',next:'M4 4l13 8-13 8zm14 0h2v16h-2z',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',levels:'M3 10v4m4-7v10m5-14v18m5-15v12m4-8v4',share:'M12 15V3m-5 5 5-5 5 5M5 13v7h14v-7',group:'M8 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-6 7a6 6 0 0 1 12 0m0-15a4 4 0 0 1 0 8m2 2a5 5 0 0 1 5 5',plus:'M12 5v14M5 12h14',volume:'M3 9h4l6-5v16l-6-5H3zm13-1q4 4 0 8m3-11q7 7 0 14',chat:'M3 4h18v13h-9l-6 4v-4H3z'};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[name]+'" fill="'+(['play','pause','next'].includes(name)?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
document.querySelectorAll('[data-icon]').forEach(i=>i.innerHTML=icon(i.dataset.icon));
let room=new URLSearchParams(location.search).get('room'),host=false,state,socket,joined=!room,offset=0,widget=null,widgetReady=false,loaded='',timer,muted=false,userPaused=false;
const demoMix=location.pathname==='/club'?'club':new URLSearchParams(location.search).get('mix');
const artwork=new Map();
let catalog=[],peaks={},intent=false;
fetch('/catalog.json').then(r=>r.json()).then(v=>catalog=v);
fetch('/peaks.json').then(r=>r.json()).then(v=>peaks=v);
const secret=id=>sessionStorage.getItem('jam-key-'+id);
const send=(type,data={})=>{if(socket?.readyState===1)socket.send(JSON.stringify({type,...data}));};
function toast(t){$('toast').textContent=t;clearTimeout(timer);timer=setTimeout(()=>$('toast').textContent='',4200);}
function fmt(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function expected(){return state?Math.max(0,Math.min(state.track.duration,state.position+(state.playing?(Date.now()+offset-state.at)/1000:0))):0;}
function modal(title,html){$('dialogTitle').textContent=title;$('dialogContent').innerHTML=html;if(!dialog.open)dialog.showModal();}
function mediaFail(){toast('Playback unavailable. Try another track or use the embedded player.');if(host&&state?.playing)send('play',{value:false});}
function loadTrack(t){
  loaded=t.id;widgetReady=false;widget=null;$('widgetBox').replaceChildren();audio.pause();audio.removeAttribute('src');audio.load();
  if(!t.url){audio.src='/audio/'+t.id+'.mp3';return;}
  const frame=document.createElement('iframe');frame.title='Official SoundCloud player';frame.allow='autoplay';frame.src='https://w.soundcloud.com/player/?url='+encodeURIComponent(t.url);$('widgetBox').append(frame);
  const bind=()=>{if(loaded!==t.id)return;widget=SC.Widget(frame);
    widget.bind(SC.Widget.Events.READY,()=>{if(loaded!==t.id)return;
      widgetReady=true;
      widget.getCurrentSound(sound=>{
        if(loaded!==t.id)return;
        if(sound?.artwork_url?.startsWith('https://'))artwork.set(t.id,sound.artwork_url);
        if(state)render();
      });
      widget.setVolume(muted?0:100);widget.getDuration(ms=>{if(host&&ms)send('duration',{track:t.id,value:ms/1000});});sync(true);});
    widget.bind(SC.Widget.Events.ERROR,mediaFail);
  };
  if(window.SC?.Widget)bind();else{const script=document.createElement('script');script.src='https://w.soundcloud.com/player/api.js';script.onload=bind;script.onerror=()=>{if(loaded===t.id)mediaFail();};document.head.append(script);}
  setTimeout(()=>{if(loaded===t.id&&!widgetReady)mediaFail();},10000);
}
function sync(force=false){
  if(!state||!joined)return;const p=expected(),t=state.track;
  if(t.url){if(!widgetReady)return;const w=widget;w.getPosition(ms=>{if(widget!==w)return;if(force||Math.abs(ms/1000-p)>1.5)w.seekTo(p*1000);});if(state.playing)w.play();else w.pause();return;}
  if(audio.readyState && (force||Math.abs(audio.currentTime-p)>1.5))audio.currentTime=p;
  if(state.playing && audio.paused && !userPaused)audio.play().catch(()=>{userPaused=true;toast('Tap play to enable sound.');render();});else if(!state.playing&&!audio.paused)audio.pause();
}
audio.addEventListener('loadedmetadata',()=>sync(true));
function unlock(){userPaused=false;if(state?.track.url){widget?.play();}else if(audio.src){audio.play().then(()=>{if(!state?.playing&&!intent)audio.pause();}).catch(()=>{});}}
function connect(){
  socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
  socket.onopen=()=>{send('ping',{sent:Date.now()});send('enter',{room,mix:demoMix,key:room?secret(room):null});};
  socket.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.type==='pong'){offset=m.at-(m.sent+Date.now())/2;return;}
    if(m.type==='error'){toast(m.message);$('status').textContent=m.message;return;}
    if(m.type==='welcome'){room=m.room;host=m.host;if(host){joined=true;sessionStorage.setItem('jam-key-'+room,m.key);}return;}
    if(m.type==='state'){
      const changed=loaded!==m.track.id,jumped=state&&Math.abs(expected()-m.position)>0.35;
      state=m;if(changed)loadTrack(m.track);sync(changed||jumped);render();
      if(m.jam&&host)history.replaceState(null,'','/?room='+room);
      if(!joined&&!dialog.open)joinPrompt();
    }
  };
  socket.onclose=()=>{$('status').textContent='Reconnecting…';audio.pause();widget?.pause();state=null;setTimeout(connect,1200);};
}
function joinPrompt(){modal('Join this Jam','<p>Listen with the host and add tracks to the shared queue.</p><button class="primary" id="joinListen">Join &amp; Listen</button>');$('joinListen').onclick=()=>{joined=true;unlock();dialog.close();sync(true);render();};}
function invite(){
  modal('Invite to Jam','<p>Anyone with the link can listen and add tracks.</p><input id="invite" readonly aria-label="Room invite link"><button class="primary" id="copy">Copy invite link</button>');
  $('invite').value=location.origin+'/?room='+room;
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);toast('Invite link copied');dialog.close();}catch{$('invite').select();toast('Select and copy the invite link.');}};
}
function start(){if(!state)return;if(!joined)return joinPrompt();if(!state.jam)send('jam');invite();}
$('jam').onclick=start;$('share').onclick=start;
function play(){
  if(!state)return;if(!joined)return joinPrompt();if(userPaused){unlock();sync();return;}
  if(!host)return;if(state.track.url&&!widgetReady){toast('Waiting for the SoundCloud player.');return;}intent=!state.playing;if(intent)unlock();send('play',{value:intent});
}
document.querySelectorAll('.play').forEach(b=>b.onclick=play);
$('next').onclick=()=>send('next',{index:0});
$('progress').onchange=e=>send('seek',{value:e.target.value/1000*state.track.duration});
$('wave').onclick=e=>{if(host&&state)send('seek',{value:e.offsetX/e.target.clientWidth*state.track.duration});};
$('wave').onkeydown=e=>{if(host&&['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();send('seek',{value:expected()+(e.key==='ArrowRight'?5:-5)});}};
$('mute').onclick=()=>{muted=!muted;audio.muted=muted;widget?.setVolume(muted?0:100);$('mute').style.opacity=muted?.4:1;$('mute').setAttribute('aria-label',muted?'Unmute':'Mute');};
$('add').onclick=()=>{if(!joined)return joinPrompt();modal('Add a track','<form id="linkForm"><label>Public SoundCloud track URL<input id="link" type="url" required placeholder="https://soundcloud.com/artist/track"></label><button class="primary">Add to queue</button></form><p>Or choose a demo track</p><div id="picks"></div>');
  $('linkForm').onsubmit=e=>{e.preventDefault();send('add',{url:$('link').value});dialog.close();};
  catalog.forEach(t=>{let b=document.createElement('button');b.className='pick';b.textContent=t.title+'  +';b.onclick=()=>{send('add',{id:t.id});dialog.close();};$('picks').append(b);});
};
for(const emoji of ['🔥','🧡','🙌','⚡']){const b=document.createElement('button');b.textContent=emoji;b.setAttribute('aria-label','React '+emoji);b.onclick=()=>send('react',{track:state.track.id,emoji});$('emojis').append(b);}
const blankCover='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
function cover(t){return t.url?(artwork.get(t.id)||blankCover):'/art/'+t.id+'.jpg';}
function render(){
  const t=state.track;
  $('cover').hidden=$('miniCover').hidden=false;
  $('cover').src=$('miniCover').src=cover(t);$('cover').alt=t.title+' cover';document.querySelector('.hero').style.setProperty('--bg','url('+cover(t)+')');
  $('title').textContent=$('miniTitle').textContent=t.title;$('artist').textContent=$('miniArtist').textContent=t.artist;$('genre').textContent=t.genre;
  $('length').textContent=$('dockLength').textContent=fmt(t.duration);
  $('jam').querySelector('span').textContent=state.jam?'Invite to Jam':'Start Jam';
  $('status').textContent=state.jam?(state.hostOnline?'Jam live · '+state.listeners+' listening':'Host disconnected · Paused'):'Solo listening';
  $('reactionText').textContent=state.jam?'React at the current timestamp.':'Start a Jam to react together.';
  $('count').textContent=state.queue.length;$('rows').replaceChildren();
  state.queue.forEach((q,index)=>{const row=document.createElement('div');row.className='row';row.innerHTML='<span class="index"></span><img alt=""><div><b></b><label></label></div><span class="duration"></span><button aria-label="Play queued track"></button>';
    row.querySelector('.index').textContent=String(index+1).padStart(2,'0');row.querySelector('img').src=cover(q);row.querySelector('b').textContent=q.title;row.querySelector('label').textContent=q.artist;row.querySelector('.duration').textContent=q.duration?fmt(q.duration):'—';
    const b=row.querySelector('button');b.innerHTML=icon('play');b.disabled=!host;b.onclick=()=>send('next',{index});$('rows').append(row);});
  document.querySelectorAll('.play').forEach(b=>{b.innerHTML=icon(state.playing&&!userPaused?'pause':'play');b.disabled=joined&&!host&&!userPaused;b.setAttribute('aria-label',state.playing&&!userPaused?'Pause track':'Play track');});
  $('next').disabled=!host||!state.queue.length;$('progress').disabled=!host;
  document.querySelectorAll('#emojis button').forEach(b=>b.disabled=!state.jam||!joined);
  $('markers').replaceChildren();$('feed').replaceChildren();
  state.reactions.filter(r=>r.track===t.id).slice(-16).forEach(r=>{let m=document.createElement('span');m.style.left=Math.min(97,100*r.position/(t.duration||1))+'%';m.textContent=r.emoji;$('markers').append(m);const el=document.createElement('div');el.textContent=r.emoji+'  '+r.who+' at '+fmt(r.position);$('feed').prepend(el);});
}
function draw(){
  if(!state)return;const p=expected(),frac=p/(state.track.duration||1),c=$('wave');const w=c.clientWidth,h=c.clientHeight,ratio=devicePixelRatio||1;
  if(c.width!==Math.round(w*ratio)||c.height!==Math.round(h*ratio)){c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);}
  const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  const data=peaks[state.track.id],bars=Math.floor(w/4);
  for(let i=0;i<bars;i++){let a=data?data[Math.floor(i/bars*data.length)]:.35;let size=(.12+.88*a)*h;ctx.fillStyle=i/bars<=frac?'#ff640d':'#f5e4d7';ctx.fillRect(i*4,(h-size)*.65,2.8,size*.65);ctx.fillStyle=i/bars<=frac?'#c85320':'#b09180';ctx.fillRect(i*4,h*.65+2,2.8,size*.31);}
  $('time').textContent=$('dockTime').textContent=fmt(p);if(document.activeElement!==$('progress'))$('progress').value=frac*1000;c.setAttribute('aria-valuenow',Math.floor(p));c.setAttribute('aria-valuemax',Math.ceil(state.track.duration));
}
setInterval(draw,100);setInterval(()=>{if(state?.playing)sync();},1200);setInterval(()=>send('ping',{sent:Date.now()}),15000);connect();
