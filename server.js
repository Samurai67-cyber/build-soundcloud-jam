const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {WebSocketServer} = require('ws');
const catalog = require('./public/catalog.json');
const clubDemo = [
  {id:'mk-blue-jeans',title:'Blue Jeans (MK Dark Blue Dub)',artist:'Lana Del Rey · MK',genre:'Remix',url:'https://soundcloud.com/marckinchen/lana-del-rey-blue-jeans-mk-dark-blue-dub',duration:0},
  {id:'catch-me-in-amsterdam',title:'Catch Me in Amsterdam',artist:'Cloonee ft. Sirolf',genre:'House',url:'https://soundcloud.com/cloonee/cloonee-catch-me-in-amsterdam-ft-sirolf-1',duration:0}
];
const root = path.join(__dirname,'public');
const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.jpg':'image/jpeg','.mp3':'audio/mpeg','.mp4':'video/mp4','.pdf':'application/pdf'};
const server = http.createServer((req,res)=>{
  if(req.url === '/health') return res.end('ok');
  let route;
  try { route = new URL(req.url,'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end(); }
  const file = path.resolve(root,'.'+(route==='/'?'/index.html':route));
  if(!file.startsWith(root+path.sep) || !fs.statSync(file,{throwIfNoEntry:false})?.isFile()) {res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  const size=fs.statSync(file).size;
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  if(range){
    const start=Number(range[1]), end=range[2]?Math.min(size-1,Number(range[2])):size-1;
    if(start>end){res.writeHead(416);return res.end();}
    res.writeHead(206,{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
    return fs.createReadStream(file,{start,end}).pipe(res);
  }
  res.setHeader('Content-Length',size);fs.createReadStream(file).pipe(res);
});
const rooms=new Map();
const ws=new WebSocketServer({server,maxPayload:4096});
function position(r){return Math.min(r.track.duration,r.position+(r.playing?(Date.now()-r.anchor)/1000:0));}
function anchor(r,p){r.position=p;r.anchor=Date.now();}
function broadcast(r){
  const data=JSON.stringify({type:'state',track:r.track,queue:r.queue,playing:r.playing,position:position(r),at:Date.now(),listeners:r.peers.size,jam:r.jam,reactions:r.reactions,hostOnline:[...r.peers].some(s=>s.host)});
  for(const s of r.peers)s.send(data);
}
function next(r,index=0){
  if(r.queue.length){r.track=r.queue.splice(index,1)[0];}
  else r.playing=false;
  anchor(r,0);
}
ws.on('connection',(s,req)=>{
  if(req.headers.origin){
    try { if(new URL(req.headers.origin).host!==req.headers.host)return s.close(1008); }
    catch { return s.close(1008); }
  }
  let r,burst=0,last=Date.now();
  const error=message=>s.send(JSON.stringify({type:'error',message}));
  s.on('message',raw=>{
    if(Date.now()-last>1000){burst=0;last=Date.now();}
    if(++burst>40)return s.close(1008);
    let m;try{m=JSON.parse(raw);}catch{return;}if(!m||typeof m!=='object')return;
    if(m.type==='ping')return s.send(JSON.stringify({type:'pong',sent:m.sent,at:Date.now()}));
    if(!r){
      if(m.type!=='enter')return;
      if(m.room){r=rooms.get(m.room);if(!r){error('This room has expired. Open a new listening room.');return;}}
      else {
        if(rooms.size>=1000)return error('Rooms are full. Try again later.');
        const tracks=m.mix==='club'?clubDemo.map(track=>({...track})):catalog;
        r={id:randomUUID(),key:randomUUID(),track:tracks[0],queue:tracks.slice(1),position:0,anchor:Date.now(),playing:false,jam:false,reactions:[],peers:new Set()};
        rooms.set(r.id,r);s.host=true;
      }
      s.host=!!s.host || m.key===r.key;r.peers.add(s);
      s.send(JSON.stringify({type:'welcome',room:r.id,host:s.host,key:s.host?r.key:undefined}));
    }else if(m.type==='add'){
      if(r.queue.length>=40)return error('The queue is full.');
      let track=catalog.find(t=>t.id===m.id);
      if(!track){
        let u;try{u=new URL(m.url);}catch{return error('Enter a public SoundCloud track URL.');}
        if(u.protocol!=='https:'||!['soundcloud.com','www.soundcloud.com'].includes(u.host)||u.username||u.password||!/^\/[\w-]+\/[\w-]+\/?$/.test(u.pathname))return error('Use a soundcloud.com/artist/track link.');
        const [artist,title]=u.pathname.slice(1).split('/');
        track={id:randomUUID(),url:u.origin+u.pathname,title:title.replaceAll('-',' '),artist,genre:'SoundCloud',duration:0};
      }
      r.queue.push(track);
    }else if(m.type==='react'){
      if(!r.jam||m.track!==r.track.id||!['🔥','🧡','🙌','⚡'].includes(m.emoji))return;
      r.reactions.push({id:randomUUID(),emoji:m.emoji,track:r.track.id,position:position(r),who:s.host?'Host':'Guest'});r.reactions=r.reactions.slice(-80);
    }else if(s.host){
      if(m.type==='jam')r.jam=true;
      else if(m.type==='play'){anchor(r,position(r));r.playing=!!m.value;}
      else if(m.type==='seek'&&Number.isFinite(m.value))anchor(r,Math.max(0,Math.min(r.track.duration,m.value)));
      else if(m.type==='next'&&r.queue.length&&Number.isInteger(m.index)&&r.queue[m.index])next(r,m.index);
      else if(m.type==='duration'&&r.track.url&&m.track===r.track.id&&Number.isFinite(m.value)&&m.value>0)r.track.duration=m.value;
      else return;
    }else return;
    broadcast(r);
  });
  s.on('close',()=>{if(!r)return;r.peers.delete(s);if(s.host){anchor(r,position(r));r.playing=false;}r.lastLeft=Date.now();broadcast(r);});
});
setInterval(()=>{for(const [id,r] of rooms){
  if(!r.peers.size && Date.now()-r.lastLeft>600000){rooms.delete(id);continue;}
  if(r.playing && r.track.duration && position(r)>=r.track.duration){next(r);broadcast(r);}
}},250).unref();
server.listen(process.env.PORT||3000,'0.0.0.0');
