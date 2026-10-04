
import http from "node:http";
import crypto from "node:crypto";
import {WebSocketServer} from "ws";
import {createGame,startGame,related,publicState} from "./game.js";

const games=new Map();

function code(){return Math.random().toString(36).slice(2,7).toUpperCase()}
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg))}
function broadcast(room){
  for(const p of room.game.players) if(p.ws) send(p.ws,{type:"state",state:publicState(room.game,p.id)});
}
function getRoom(ws){return [...games.values()].find(r=>r.game.players.some(p=>p.ws===ws))}

const server=http.createServer((req,res)=>{
  if(req.url==="/"||req.url==="/health"){
    res.writeHead(200,{"content-type":"text/plain; charset=utf-8"});
    res.end("UNKNOWN server online");
    return;
  }
  res.writeHead(404);res.end();
});
const wss=new WebSocketServer({server});

wss.on("connection",ws=>{
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==="create"){
      let c;do{c=code()}while(games.has(c));
      const game=createGame(),id=0;
      game.players.push({id,name:m.name||"Spieler 1",ws,connected:true});
      games.set(c,{game});
      send(ws,{type:"joined",code:c,playerId:id});
      broadcast(games.get(c));return;
    }
    if(m.type==="join"){
      const room=games.get(String(m.code||"").toUpperCase());
      if(!room)return send(ws,{type:"error",message:"Lobby nicht gefunden."});
      if(room.game.players.length>=4)return send(ws,{type:"error",message:"Lobby ist voll."});
      if(room.game.phase!=="lobby")return send(ws,{type:"error",message:"Spiel läuft bereits."});
      const id=room.game.players.length;
      room.game.players.push({id,name:m.name||`Spieler ${id+1}`,ws,connected:true});
      send(ws,{type:"joined",code:String(m.code).toUpperCase(),playerId:id});
      broadcast(room);return;
    }
    const room=getRoom(ws);if(!room)return;
    const game=room.game;
    const me=game.players.find(p=>p.ws===ws);if(!me)return;

    if(m.type==="start"){
      if(game.players.length<2)return send(ws,{type:"error",message:"Mindestens 2 Spieler."});
      if(me.id!==0)return;
      startGame(game);broadcast(room);return;
    }
    if(game.phase!=="playing"||game.current!==me.id)return;

    if(m.type==="play"){
      const card=me.hand[m.index];if(!card)return;
      me.hand.splice(m.index,1);
      game.pending={player:me.id,card};
      game.answer=null;
      broadcast(room);return;
    }
    if(m.type==="resolve"){
      if(!game.pending||game.pending.player!==me.id)return;
      const yes=related(game.pending.card,me.secret);
      if(yes)me.related.push(game.pending.card);else me.notRelated.push(game.pending.card);
      game.answer=yes?"RELATED":"NOT RELATED";
      if(game.deck.length)me.hand.push(game.deck.pop());
      game.pending=null;
      game.current=(game.current+1)%game.players.length;
      broadcast(room);return;
    }
    if(m.type==="guess"){
      if(!me.secret)return;
      const ok=m.c===me.secret.c&&m.a===me.secret.a&&m.l===me.secret.l;
      if(ok){game.phase="finished";game.winner=me.id;broadcast(room);return}
      game.pending={guess:true,player:me.id};game.answer="WRONG";broadcast(room);return;
    }
    if(m.type==="flip"){
      if(!game.pending?.guess||game.pending.player!==me.id)return;
      if(m.pile==="related")me.flipped="related";
      if(m.pile==="notRelated")me.flipped="notRelated";
      game.pending=null;game.current=(game.current+1)%game.players.length;broadcast(room);
    }
  });
  ws.on("close",()=>{
    const room=getRoom(ws);if(!room)return;
    const p=room.game.players.find(p=>p.ws===ws);if(p)p.connected=false;
    broadcast(room);
  });
});

const port=process.env.PORT||10000;
server.listen(port,()=>console.log(`UNKNOWN listening on ${port}`));
